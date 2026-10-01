<?php

namespace App\Http\Controllers;

use App\Http\Requests\ReturnStockRequest;
use App\Http\Requests\SaveStockBorrowingRequest;
use App\Models\StockBorrowing;
use App\Models\User;
use App\Services\SolarAccessService;
use App\Services\StockService;
use Illuminate\Http\Request;

class StockBorrowingController extends Controller
{
    public function __construct(private readonly SolarAccessService $access, private readonly StockService $stock) {}

    public function index(Request $request)
    {
        $this->access->requirePermission($request, 'view_stock');

        return StockBorrowing::with([
            'item:id,name,image_path,updated_at',
            'givenBy:id,name,role',
            'creator:id,name',
            'returns' => fn ($query) => $query->with(['receivedBy:id,name,role', 'creator:id,name'])->latest('returned_on')->latest('id'),
        ])->latest('borrowed_on')->latest('id')->limit(500)->get();
    }

    public function people(Request $request)
    {
        $this->access->requirePermission($request, 'view_stock');

        return User::with('employee:id,user_id,employee_code')
            ->where('active', true)
            ->whereIn('role', ['super_admin', 'company_admin', 'manager', 'employee'])
            ->orderBy('name')
            ->get(['id', 'name', 'role'])
            ->map(fn (User $user) => [
                'id' => $user->id,
                'name' => $user->name,
                'role' => $user->role,
                'employee_code' => $user->employee?->employee_code,
            ]);
    }

    public function store(SaveStockBorrowingRequest $request): StockBorrowing
    {
        $this->access->requirePermission($request, 'issue_stock');

        return $this->stock->borrow($request->validated(), $request->user());
    }

    public function receive(ReturnStockRequest $request, StockBorrowing $stockBorrowing): StockBorrowing
    {
        $this->access->requirePermission($request, 'return_stock');

        return $this->stock->receive($stockBorrowing, $request->validated(), $request->user());
    }
}
