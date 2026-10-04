<?php

namespace App\Http\Controllers;

use App\Models\Company;
use App\Models\SolarCurtailment;
use App\Services\WeatherService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SolarCurtailmentController extends Controller
{
    public function __construct(
        protected WeatherService $weatherService
    ) {}

    /**
     * Get active and recent curtailments
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $companyFilter = $request->query('company_id');

        $query = SolarCurtailment::with(['company', 'user'])
            ->orderByRaw("CASE WHEN status = 'active' THEN 1 ELSE 2 END")
            ->orderBy('started_at', 'desc');

        if ($companyFilter && $companyFilter !== 'all') {
            $query->where('company_id', $companyFilter);
        } elseif ($user && $user->role === 'company_admin') {
            $query->where('company_id', $user->company_id);
        }

        $allRecords = $query->take(50)->get();
        $now = Carbon::now();
        $unitRate = 3.80; // ₹3.80 Rs per unit

        $companyIds = $allRecords->pluck('company_id')->filter()->unique();
        $inverterMap = \App\Models\Inverter::whereIn('company_id', $companyIds)->get()->keyBy('id');

        $activeCurtailments = [];
        $historyCurtailments = [];

        foreach ($allRecords as $c) {
            $isActive = $c->status === 'active';
            $startedAt = $c->started_at;
            $endedAt = $c->ended_at ?: $now;

            $durationMinutes = max(1, (int) round($startedAt->diffInMinutes($endedAt)));
            $percentage = (int) $c->percentage;
            $companyCapacityKw = (float) ($c->company?->total_capacity_kw ?? 500.0);

            // Calculate estimated lost kWh based on % and duration
            $lostKwh = $c->total_lost_kwh > 0 && !$isActive
                ? (float) $c->total_lost_kwh
                : round(($companyCapacityKw * ($percentage / 100.0) * ($durationMinutes / 60.0) * 0.75), 1);

            $lostRevenueRs = $c->total_lost_revenue_rs > 0 && !$isActive
                ? (float) $c->total_lost_revenue_rs
                : round($lostKwh * $unitRate, 2);

            $invNames = [];
            foreach ((array) ($c->inverter_ids ?? []) as $iId) {
                if (isset($inverterMap[$iId])) {
                    $invNames[] = $inverterMap[$iId]->name;
                }
            }

            $dataItem = [
                'id' => $c->id,
                'company_id' => $c->company_id,
                'company_name' => $c->company?->name ?? 'Solar Company',
                'user_name' => $c->user?->name ?? 'System',
                'percentage' => $percentage,
                'status' => $c->status,
                'is_active' => $isActive,
                'inverter_ids' => $c->inverter_ids ?? [],
                'inverter_names' => $invNames,
                'pv_strings' => $c->pv_strings ?? [],
                'step_history' => $c->step_history ?? [],
                'started_at' => $c->started_at?->toIso8601String(),
                'started_at_human' => $c->started_at?->format('h:i A'),
                'ended_at' => $c->ended_at?->toIso8601String(),
                'ended_at_human' => $c->ended_at ? $c->ended_at->format('h:i A') : 'ચાલુ છે',
                'date' => $c->started_at?->format('d M Y'),
                'duration_minutes' => $durationMinutes,
                'duration_human' => $this->formatDuration($durationMinutes),
                'lost_kwh' => $lostKwh,
                'lost_revenue_rs' => $lostRevenueRs,
                'notes' => $c->notes,
            ];

            if ($isActive) {
                $activeCurtailments[] = $dataItem;
            } else {
                $historyCurtailments[] = $dataItem;
            }
        }

        $totalActiveLossRs = array_sum(array_column($activeCurtailments, 'lost_revenue_rs'));
        $totalActiveLossKwh = array_sum(array_column($activeCurtailments, 'lost_kwh'));

        return response()->json([
            'is_any_active' => count($activeCurtailments) > 0,
            'active_count' => count($activeCurtailments),
            'active_curtailments' => $activeCurtailments,
            'history_curtailments' => $historyCurtailments,
            'total_active_loss_rs' => round($totalActiveLossRs, 2),
            'total_active_loss_kwh' => round($totalActiveLossKwh, 1),
        ]);
    }

    /**
     * Set or Step-Update Curtailment for a company or multiple companies
     */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        $now = Carbon::now();

        // Check if multi-company payload was provided
        if ($request->has('companies') && is_array($request->input('companies'))) {
            $createdOrUpdated = [];
            foreach ($request->input('companies') as $item) {
                if (empty($item['company_id']) || empty($item['percentage'])) {
                    continue;
                }
                $companyId = (int) $item['company_id'];
                $percentage = (int) $item['percentage'];
                $inverterIds = $item['inverter_ids'] ?? [];
                $pvStrings = $item['pv_strings'] ?? [];
                $notes = $item['notes'] ?? 'PGVCL Curtailment Order';

                $existing = SolarCurtailment::where('company_id', $companyId)
                    ->where('status', 'active')
                    ->first();

                if ($existing) {
                    $history = $existing->step_history ?? [];
                    $history[] = [
                        'from_percentage' => $existing->percentage,
                        'to_percentage' => $percentage,
                        'changed_at' => $now->toIso8601String(),
                        'changed_at_human' => $now->format('h:i A'),
                        'changed_by' => $user?->name ?? 'Operator',
                    ];
                    $existing->update([
                        'percentage' => $percentage,
                        'inverter_ids' => $inverterIds ?: $existing->inverter_ids,
                        'pv_strings' => $pvStrings ?: $existing->pv_strings,
                        'step_history' => $history,
                        'notes' => $notes ?: $existing->notes,
                        'user_id' => $user?->id,
                    ]);
                    $createdOrUpdated[] = $existing;
                } else {
                    $initialHistory = [
                        [
                            'from_percentage' => 0,
                            'to_percentage' => $percentage,
                            'changed_at' => $now->toIso8601String(),
                            'changed_at_human' => $now->format('h:i A'),
                            'changed_by' => $user?->name ?? 'Operator',
                        ]
                    ];
                    $createdOrUpdated[] = SolarCurtailment::create([
                        'company_id' => $companyId,
                        'user_id' => $user?->id,
                        'percentage' => $percentage,
                        'status' => 'active',
                        'inverter_ids' => $inverterIds,
                        'pv_strings' => $pvStrings,
                        'step_history' => $initialHistory,
                        'started_at' => $now,
                        'notes' => $notes,
                    ]);
                }
            }

            return response()->json([
                'success' => true,
                'message' => count($createdOrUpdated) . ' કંપનીઓ માટે PGVCL કર્ટલમેન્ટ સફળતાપૂર્વક સેટ થઈ ગયું છે.',
                'curtailments' => $createdOrUpdated,
            ]);
        }

        $validated = $request->validate([
            'company_id' => 'required|exists:companies,id',
            'percentage' => 'required|integer|between:1,100',
            'inverter_ids' => 'nullable|array',
            'pv_strings' => 'nullable|array',
            'notes' => 'nullable|string|max:255',
        ]);

        $companyId = (int) $validated['company_id'];
        $percentage = (int) $validated['percentage'];

        // Check if there is an active curtailment for this company
        $existing = SolarCurtailment::where('company_id', $companyId)
            ->where('status', 'active')
            ->first();

        if ($existing) {
            // Step update (% changed, e.g. 40% -> 20% -> 10%)
            $history = $existing->step_history ?? [];
            $history[] = [
                'from_percentage' => $existing->percentage,
                'to_percentage' => $percentage,
                'changed_at' => $now->toIso8601String(),
                'changed_at_human' => $now->format('h:i A'),
                'changed_by' => $user?->name ?? 'Operator',
            ];

            $existing->update([
                'percentage' => $percentage,
                'inverter_ids' => $validated['inverter_ids'] ?? $existing->inverter_ids,
                'pv_strings' => $validated['pv_strings'] ?? $existing->pv_strings,
                'step_history' => $history,
                'notes' => $validated['notes'] ?? $existing->notes,
                'user_id' => $user?->id,
            ]);

            return response()->json([
                'success' => true,
                'message' => "કર્ટલમેન્ટ સફળતાપૂર્વક {$percentage}% માં અપડેટ થઈ ગયું છે.",
                'curtailment' => $existing,
            ]);
        }

        // New Curtailment
        $initialHistory = [
            [
                'from_percentage' => 0,
                'to_percentage' => $percentage,
                'changed_at' => $now->toIso8601String(),
                'changed_at_human' => $now->format('h:i A'),
                'changed_by' => $user?->name ?? 'Operator',
            ]
        ];

        $curtailment = SolarCurtailment::create([
            'company_id' => $companyId,
            'user_id' => $user?->id,
            'percentage' => $percentage,
            'status' => 'active',
            'inverter_ids' => $validated['inverter_ids'] ?? [],
            'pv_strings' => $validated['pv_strings'] ?? [],
            'step_history' => $initialHistory,
            'started_at' => $now,
            'notes' => $validated['notes'] ?? 'PGVCL Curtailment Order',
        ]);

        return response()->json([
            'success' => true,
            'message' => "PGVCL કર્ટલમેન્ટ {$percentage}% સફળતાપૂર્વક સક્રિય થઈ ગયું છે.",
            'curtailment' => $curtailment,
        ]);
    }

    /**
     * Master 100% Full Power Restore (End All or specific company curtailments)
     */
    public function restoreAll(Request $request): JsonResponse
    {
        $companyId = $request->input('company_id');
        $now = Carbon::now();
        $unitRate = 3.80;

        $query = SolarCurtailment::where('status', 'active');
        if ($companyId && $companyId !== 'all') {
            $query->where('company_id', (int) $companyId);
        }

        $activeList = $query->with('company')->get();

        foreach ($activeList as $item) {
            $startedAt = $item->started_at;
            $durationMinutes = max(1, (int) round($startedAt->diffInMinutes($now)));
            $companyCapacityKw = (float) ($item->company?->total_capacity_kw ?? 500.0);
            $percentage = (int) $item->percentage;

            $lostKwh = round(($companyCapacityKw * ($percentage / 100.0) * ($durationMinutes / 60.0) * 0.75), 1);
            $lostRevenueRs = round($lostKwh * $unitRate, 2);

            $history = $item->step_history ?? [];
            $history[] = [
                'from_percentage' => $item->percentage,
                'to_percentage' => 0,
                'changed_at' => $now->toIso8601String(),
                'changed_at_human' => $now->format('h:i A'),
                'changed_by' => $request->user()?->name ?? 'Operator',
                'action' => '100% Full Power Restored',
            ];

            $item->update([
                'status' => 'completed',
                'ended_at' => $now,
                'duration_minutes' => $durationMinutes,
                'total_lost_kwh' => $lostKwh,
                'total_lost_revenue_rs' => $lostRevenueRs,
                'step_history' => $history,
            ]);
        }

        return response()->json([
            'success' => true,
            'message' => 'તમામ પ્લાન્ટ ૧૦૦% ફુલ પાવર મોડમાં સફળતાપૂર્વક શરૂ થઈ ગયા છે! (Curtailment Ended)',
            'restored_count' => count($activeList),
        ]);
    }

    /**
     * Delete a curtailment
     */
    public function destroy(SolarCurtailment $curtailment): JsonResponse
    {
        $curtailment->delete();
        return response()->json(['success' => true, 'message' => 'Curtailment record deleted.']);
    }

    private function formatDuration(int $minutes): string
    {
        if ($minutes < 60) {
            return "{$minutes} મિનિટ";
        }
        $h = floor($minutes / 60);
        $m = $minutes % 60;
        return $m > 0 ? "{$h} કલાક {$m} મિનિટ" : "{$h} કલાક";
    }
}
