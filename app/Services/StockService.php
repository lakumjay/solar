<?php

namespace App\Services;

use App\Models\StockBorrowing;
use App\Models\StockItem;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Throwable;

class StockService
{
    public function __construct(private readonly ActivityLogger $activity) {}

    public function inventory(): array
    {
        $items = StockItem::with([
            'borrowings:id,stock_item_id,quantity,returned_quantity',
            'movements' => fn ($query) => $query->with('creator:id,name')->latest()->limit(50),
        ])
            ->orderByDesc('active')->orderBy('name')->get()
            ->map(fn (StockItem $item) => $this->itemPayload($item));

        return [
            'summary' => [
                'total_items' => $items->where('active', true)->count(),
                'total_quantity' => round($items->where('active', true)->sum('total_quantity'), 2),
                'available_quantity' => round($items->where('active', true)->sum('available_quantity'), 2),
                'borrowed_quantity' => round($items->where('active', true)->sum('borrowed_quantity'), 2),
                'total_value' => round($items->where('active', true)->sum('total_value'), 2),
                'low_stock_items' => $items->where('active', true)->filter(fn (array $item) => $item['available_quantity'] <= $item['low_stock_threshold'])->count(),
            ],
            'items' => $items->values(),
        ];
    }

    public function saveItem(array $data, ?UploadedFile $image, User $actor): array
    {
        $itemId = $data['id'] ?? null;
        $newImagePath = $image?->store('stock-items');
        $oldImagePath = null;

        try {
            $item = DB::transaction(function () use ($data, $itemId, $newImagePath, $actor, &$oldImagePath) {
                $item = $itemId ? StockItem::lockForUpdate()->findOrFail($itemId) : new StockItem;
                $oldImagePath = $item->image_path;
                $openingQuantity = $item->exists ? 0 : round((float) ($data['opening_quantity'] ?? 0), 2);
                $item->fill([
                    'name' => $data['name'],
                    'unit_price' => $data['unit_price'],
                    'low_stock_threshold' => $data['low_stock_threshold'],
                    'notes' => $data['notes'] ?? null,
                    'active' => $data['active'],
                    'updated_by' => $actor->id,
                ]);
                if (! $item->exists) {
                    $item->created_by = $actor->id;
                    $item->total_quantity = $openingQuantity;
                }
                if ($newImagePath) {
                    $item->image_path = $newImagePath;
                }
                $item->save();

                if ($item->wasRecentlyCreated && $openingQuantity > 0) {
                    $item->movements()->create([
                        'type' => 'opening',
                        'quantity' => $openingQuantity,
                        'unit_price' => $item->unit_price,
                        'notes' => 'Opening stock',
                        'created_by' => $actor->id,
                    ]);
                }

                $this->activity->log($actor, null, $item->wasRecentlyCreated ? 'created' : 'updated', 'stock_item', $item->id, "Stock item {$item->name} saved");

                return $item;
            });
        } catch (Throwable $error) {
            if ($newImagePath) {
                Storage::delete($newImagePath);
            }
            throw $error;
        }

        if ($newImagePath && $oldImagePath && $oldImagePath !== $newImagePath) {
            Storage::delete($oldImagePath);
        }

        return $this->itemPayload($item->load('borrowings:id,stock_item_id,quantity,returned_quantity'));
    }

    public function addStock(StockItem $stockItem, array $data, User $actor): array
    {
        $item = DB::transaction(function () use ($stockItem, $data, $actor) {
            $item = StockItem::lockForUpdate()->findOrFail($stockItem->id);
            $quantity = round((float) $data['quantity'], 2);
            $item->total_quantity = round((float) $item->total_quantity + $quantity, 2);
            if (array_key_exists('unit_price', $data) && $data['unit_price'] !== null && $data['unit_price'] !== '') {
                $item->unit_price = $data['unit_price'];
            }
            $item->updated_by = $actor->id;
            $item->save();
            $item->movements()->create([
                'type' => 'stock_in',
                'quantity' => $quantity,
                'unit_price' => $data['unit_price'] ?? $item->unit_price,
                'notes' => $data['notes'] ?? null,
                'created_by' => $actor->id,
            ]);
            $this->activity->log($actor, null, 'stock_in', 'stock_item', $item->id, "Added {$quantity} quantity to {$item->name}", $data);

            return $item;
        });

        return $this->itemPayload($item->load('borrowings:id,stock_item_id,quantity,returned_quantity'));
    }

    public function borrow(array $data, User $actor): StockBorrowing
    {
        return DB::transaction(function () use ($data, $actor) {
            $item = StockItem::lockForUpdate()->findOrFail($data['stock_item_id']);
            if (! $item->active) {
                throw ValidationException::withMessages(['stock_item_id' => 'The selected stock item is inactive.']);
            }

            $borrowed = (float) StockBorrowing::where('stock_item_id', $item->id)
                ->selectRaw('COALESCE(SUM(quantity - returned_quantity), 0) AS outstanding')->value('outstanding');
            $available = round((float) $item->total_quantity - $borrowed, 2);
            $quantity = round((float) $data['quantity'], 2);
            if ($quantity > $available) {
                throw ValidationException::withMessages(['quantity' => "Only {$available} quantity is currently available."]);
            }

            $borrowing = StockBorrowing::create([
                ...$data,
                'quantity' => $quantity,
                'returned_quantity' => 0,
                'created_by' => $actor->id,
                'status' => 'pending',
            ]);
            $this->activity->log($actor, null, 'issued', 'stock_borrowing', $borrowing->id, "Issued {$quantity} {$item->name} to {$borrowing->borrower_name}", $data);

            return $this->borrowingPayload($borrowing);
        });
    }

    public function receive(StockBorrowing $stockBorrowing, array $data, User $actor): StockBorrowing
    {
        return DB::transaction(function () use ($stockBorrowing, $data, $actor) {
            $borrowing = StockBorrowing::with('item')->lockForUpdate()->findOrFail($stockBorrowing->id);
            $pending = $borrowing->pending_quantity;
            $quantity = round((float) $data['quantity'], 2);
            if ($pending <= 0) {
                throw ValidationException::withMessages(['quantity' => 'This borrowing is already fully returned.']);
            }
            if ($quantity > $pending) {
                throw ValidationException::withMessages(['quantity' => "Only {$pending} quantity is pending return."]);
            }
            if (Carbon::parse($data['returned_on'])->lt($borrowing->borrowed_on)) {
                throw ValidationException::withMessages(['returned_on' => 'Return date cannot be before the borrow date.']);
            }

            $borrowing->returns()->create([
                'quantity' => $quantity,
                'returned_on' => $data['returned_on'],
                'received_by_user_id' => $data['received_by_user_id'],
                'created_by' => $actor->id,
                'notes' => $data['notes'] ?? null,
            ]);
            $borrowing->returned_quantity = round((float) $borrowing->returned_quantity + $quantity, 2);
            $borrowing->status = $borrowing->returned_quantity >= (float) $borrowing->quantity ? 'returned' : 'partially_returned';
            $borrowing->save();
            $this->activity->log($actor, null, 'returned', 'stock_borrowing', $borrowing->id, "Received {$quantity} {$borrowing->item->name} from {$borrowing->borrower_name}", $data);

            return $this->borrowingPayload($borrowing);
        });
    }

    public function borrowingPayload(StockBorrowing $borrowing): StockBorrowing
    {
        return $borrowing->fresh([
            'item:id,name,image_path,updated_at',
            'givenBy:id,name,role',
            'creator:id,name',
            'returns' => fn ($query) => $query->with(['receivedBy:id,name,role', 'creator:id,name'])->latest('returned_on')->latest('id'),
        ]);
    }

    private function itemPayload(StockItem $item): array
    {
        $borrowed = round($item->borrowings->sum(fn (StockBorrowing $borrowing) => max(0, (float) $borrowing->quantity - (float) $borrowing->returned_quantity)), 2);
        $available = round(max(0, (float) $item->total_quantity - $borrowed), 2);
        $movements = $item->relationLoaded('movements') ? $item->movements : collect();
        $payload = $item->makeHidden(['borrowings', 'movements'])->toArray();

        return [
            ...$payload,
            'unit_price' => (float) $item->unit_price,
            'total_quantity' => (float) $item->total_quantity,
            'borrowed_quantity' => $borrowed,
            'available_quantity' => $available,
            'low_stock_threshold' => (float) $item->low_stock_threshold,
            'total_value' => round((float) $item->unit_price * (float) $item->total_quantity, 2),
            'is_low_stock' => $item->active && $available <= (float) $item->low_stock_threshold,
            'movements' => $movements,
        ];
    }
}
