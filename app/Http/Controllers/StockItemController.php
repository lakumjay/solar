<?php

namespace App\Http\Controllers;

use App\Http\Requests\AddStockRequest;
use App\Http\Requests\SaveStockItemRequest;
use App\Models\StockItem;
use App\Services\SolarAccessService;
use App\Services\StockService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class StockItemController extends Controller
{
    public function __construct(private readonly SolarAccessService $access, private readonly StockService $stock) {}

    public function index(Request $request): array
    {
        $this->access->requirePermission($request, 'view_stock');

        return $this->stock->inventory();
    }

    public function store(SaveStockItemRequest $request): array
    {
        $this->access->requirePermission($request, 'manage_stock');

        return $this->stock->saveItem($request->validated(), $request->file('image'), $request->user());
    }

    public function add(AddStockRequest $request, StockItem $stockItem): array
    {
        $this->access->requirePermission($request, 'manage_stock');

        return $this->stock->addStock($stockItem, $request->validated(), $request->user());
    }

    public function image(Request $request, StockItem $stockItem)
    {
        $this->access->requirePermission($request, 'view_stock');
        abort_unless(Storage::exists($stockItem->image_path), 404);

        return Storage::response($stockItem->image_path);
    }
}
