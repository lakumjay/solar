<?php

namespace App\Http\Controllers;

use App\Http\Requests\SaveHolidayRequest;
use App\Models\Holiday;
use App\Services\SolarAccessService;
use Illuminate\Http\Request;

class HolidayController extends Controller
{
    public function __construct(private readonly SolarAccessService $access) {}

    public function index(Request $request)
    {
        abort_unless($request->user()->role === 'employee' || $request->user()->hasPermission('view_attendance'), 403);

        return Holiday::with('creator:id,name')->latest('holiday_date')->limit(200)->get();
    }

    public function store(SaveHolidayRequest $request)
    {
        $this->access->requirePermission($request, 'manage_attendance_settings');
        $data = $request->validated();
        $data['created_by'] = $request->user()->id;

        return Holiday::updateOrCreate(['id' => $data['id'] ?? null], $data);
    }
}
