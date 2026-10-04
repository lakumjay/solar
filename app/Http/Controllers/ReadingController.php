<?php

namespace App\Http\Controllers;

use App\Http\Requests\SaveReadingRequest;
use App\Models\DailyInverterOutput;
use App\Models\DailyReading;
use App\Models\Inverter;
use App\Services\ActivityLogger;
use App\Services\ReadingCalculationService;
use App\Services\SolarAccessService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ReadingController extends Controller
{
    public function __construct(
        private readonly SolarAccessService $access,
        private readonly ReadingCalculationService $calculator,
        private readonly ActivityLogger $activity,
    ) {}

    public function index(Request $request)
    {
        $this->access->requirePermission($request, $request->user()->role === 'employee' ? 'enter_readings' : 'view_reports');
        $companyId = $this->access->requestedCompany($request);
        $query = DailyReading::with(['outputs', 'company:id,name', 'creator:id,name', 'editor:id,name'])->where('company_id', $companyId);
        $query->when($request->date_from, fn ($query, $value) => $query->where('reading_date', '>=', Carbon::parse($value)->startOfDay()));
        $query->when($request->date_to, fn ($query, $value) => $query->where('reading_date', '<=', Carbon::parse($value)->endOfDay()));

        return $query->orderByDesc('reading_date')->paginate(100);
    }

    public function store(SaveReadingRequest $request)
    {
        $data = $request->validated();
        $this->access->requireCompany($request, (int) $data['company_id']);
        $data['reading_date'] = Carbon::parse($data['reading_date'])->startOfDay();
        $user = $request->user();
        abort_unless(
            $user->hasPermission('enter_readings') || $user->hasPermission('edit_readings'),
            403,
            'This action is unauthorized. Permission required to save daily reading.'
        );

        $outputList = collect($data['outputs'] ?? []);
        if ($outputList->isNotEmpty()) {
            $inverterIds = $outputList->pluck('inverter_id')->filter();
            abort_unless(
                Inverter::where('company_id', $data['company_id'])->whereIn('id', $inverterIds)->count() === $inverterIds->unique()->count(),
                422,
                'One or more inverters do not belong to the selected company.',
            );
        }

        $existing = DailyReading::where('company_id', $data['company_id'])
            ->where('reading_date', $data['reading_date'])
            ->first();

        DB::transaction(function () use ($request, $data, $existing, &$reading) {
            $reading = DailyReading::updateOrCreate(
                ['company_id' => $data['company_id'], 'reading_date' => $data['reading_date']],
                collect($data)->except('outputs')->merge([
                    'created_by' => $existing?->created_by ?? $request->user()->id,
                    'updated_by' => $request->user()->id,
                ])->all(),
            );

            if (!empty($data['outputs'])) {
                foreach ($data['outputs'] as $output) {
                    $gen = isset($output['generation']) && $output['generation'] !== '' && $output['generation'] !== null
                        ? (float) $output['generation']
                        : 0.0;

                    DailyInverterOutput::updateOrCreate(
                        [
                            'daily_reading_id' => $reading->id,
                            'inverter_id' => (int) $output['inverter_id'],
                        ],
                        [
                            'generation' => $gen,
                        ]
                    );
                }
            }

            $this->calculator->recalculate((int) $data['company_id']);
            $this->activity->log(
                $request->user(),
                (int) $data['company_id'],
                $existing ? 'updated' : 'created',
                'daily_reading',
                $reading->id,
                "Daily reading saved for {$data['reading_date']}",
                collect($data)->except('outputs')->all(),
            );
        });

        return $reading->fresh()->load('outputs');
    }
}
