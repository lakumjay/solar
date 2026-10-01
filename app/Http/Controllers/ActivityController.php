<?php

namespace App\Http\Controllers;

use App\Models\ActivityLog;
use App\Services\SolarAccessService;
use Illuminate\Http\Request;

class ActivityController extends Controller
{
    public function __construct(private readonly SolarAccessService $access) {}

    public function index(Request $request)
    {
        $this->access->requireUserManagement($request);
        $query = ActivityLog::with(['user:id,name', 'company:id,name'])->latest();

        if ($request->user()->role !== 'super_admin') {
            $query->where('company_id', $request->user()->company_id);
        } elseif ($request->filled('company_id')) {
            $query->where('company_id', $request->integer('company_id'));
        }

        return $query->paginate(100);
    }
}
