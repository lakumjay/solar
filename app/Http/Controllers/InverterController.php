<?php

namespace App\Http\Controllers;

use App\Http\Requests\SaveInverterRequest;
use App\Models\Inverter;
use App\Services\ActivityLogger;
use App\Services\SolarAccessService;

class InverterController extends Controller
{
    public function __construct(
        private readonly SolarAccessService $access,
        private readonly ActivityLogger $activity,
    ) {}

    public function store(SaveInverterRequest $request)
    {
        $this->access->requireSuperAdmin($request);
        $data = $request->validated();
        if (! empty($data['id'])) {
            abort_unless(Inverter::whereKey($data['id'])->where('company_id', $data['company_id'])->exists(), 422, 'Inverter does not belong to this company.');
        }

        $inverter = Inverter::updateOrCreate(['id' => $data['id'] ?? null], $data);
        $this->activity->log($request->user(), (int) $data['company_id'], $inverter->wasRecentlyCreated ? 'created' : 'updated', 'inverter', $inverter->id, "Inverter {$inverter->name} saved", $data);

        return $inverter;
    }
}
