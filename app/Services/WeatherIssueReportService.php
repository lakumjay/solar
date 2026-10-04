<?php

namespace App\Services;

use App\Models\Company;
use App\Models\DailyReading;
use App\Models\Inverter;
use App\Models\SolarCurtailment;
use Carbon\Carbon;
use Carbon\CarbonPeriod;

class WeatherIssueReportService
{
    /**
     * Build the Weather & Issue Report for a company or all companies combined.
     */
    public function build(?int $companyId, Carbon $from, Carbon $to): array
    {
        $companiesQuery = Company::with('inverters');
        if ($companyId) {
            $companiesQuery->where('id', $companyId);
        }
        $companies = $companiesQuery->get();
        $targetCompany = $companyId ? $companies->first() : null;

        // Calculate expected daily capacity
        $totalCapacityKw = (float) $companies->sum(fn ($c) => (float) ($c->total_capacity_kw ?? 500.0));
        if ($totalCapacityKw <= 0) {
            $totalCapacityKw = 500.0 * max(1, $companies->count());
        }
        // Benchmark: ~4.5 kWh per kW capacity on a full sunny day
        $expectedDailyUnits = round($totalCapacityKw * 4.5, 1);
        $lowThreshold = round($expectedDailyUnits * 0.70, 1); // < 70% is considered low

        // Fetch daily readings
        $readingsQuery = DailyReading::with(['outputs', 'company'])
            ->whereBetween('reading_date', [$from->copy()->startOfDay(), $to->copy()->endOfDay()]);
        if ($companyId) {
            $readingsQuery->where('company_id', $companyId);
        }
        $readings = $readingsQuery->orderBy('reading_date')->get();

        // Fetch curtailments covering this period
        $curtailmentsQuery = SolarCurtailment::where(function ($q) use ($from, $to) {
            $q->whereBetween('started_at', [$from->copy()->startOfDay(), $to->copy()->endOfDay()])
              ->orWhere(function ($sub) use ($from, $to) {
                  $sub->where('started_at', '<=', $to->copy()->endOfDay())
                      ->where(function ($endSub) use ($from) {
                          $endSub->whereNull('ended_at')
                                 ->orWhere('ended_at', '>=', $from->copy()->startOfDay());
                      });
              });
        });
        if ($companyId) {
            $curtailmentsQuery->where('company_id', $companyId);
        }
        $curtailments = $curtailmentsQuery->get();

        // Fetch all inverters map for labelling
        $invertersMap = Inverter::whereIn('company_id', $companies->pluck('id'))->get()->keyBy('id');

        $period = CarbonPeriod::create($from, $to);
        $rows = [];
        $totalGeneration = 0.0;
        $normalDaysCount = 0;
        $lowDaysCount = 0;
        $missingDaysCount = 0;

        foreach ($period as $date) {
            $dateString = $date->toDateString();
            $dateDayReadings = $readings->filter(function ($r) use ($dateString) {
                return Carbon::parse($r->reading_date)->toDateString() === $dateString;
            });

            if ($dateDayReadings->isEmpty()) {
                $missingDaysCount++;
                $rows[] = [
                    'date' => $dateString,
                    'date_formatted' => $date->format('d M Y'),
                    'day_name' => $date->format('l'),
                    'generation' => 0.0,
                    'expected_generation' => $expectedDailyUnits,
                    'pct_of_expected' => 0,
                    'status' => 'missing',
                    'status_label' => 'No Entry',
                    'badge' => '⚪ એન્ટ્રી બાકી',
                    'reason' => 'ડેટા દાખલ કરેલ નથી (No Entry)',
                    'details' => 'આ તારીખની ડેઇલી યુનિટ્સ એન્ટ્રી હજી બાકી છે.',
                    'inverters' => [],
                ];
                continue;
            }

            // Sum generation across inverter outputs and plant export
            $outputs = $dateDayReadings->flatMap(fn ($r) => $r->outputs);
            $dayGenFromOutputs = (float) $outputs->sum('generation');
            $dayGenFromExport = (float) $dateDayReadings->sum('plant_export_unit');
            $dayTotalGen = $dayGenFromOutputs > 0 ? $dayGenFromOutputs : $dayGenFromExport;
            $dayTotalGen = round($dayTotalGen, 1);
            $totalGeneration += $dayTotalGen;

            // Inverter breakdowns & zero-check
            $inverterBreakdown = [];
            $deadInverters = [];
            $lowInverters = [];
            $inverterCounts = $outputs->count();
            $avgPerInverter = $inverterCounts > 0 ? ($dayTotalGen / $inverterCounts) : 0;

            foreach ($outputs as $out) {
                $inv = $invertersMap->get($out->inverter_id);
                $invName = $inv ? $inv->name : "Inverter {$out->inverter_id}";
                $gen = (float) $out->generation;
                $inverterBreakdown[] = [
                    'name' => $invName,
                    'generation' => $gen,
                ];

                if ($gen <= 0.01) {
                    $deadInverters[] = $invName;
                } elseif ($avgPerInverter > 200 && $gen < ($avgPerInverter * 0.35)) {
                    $lowInverters[] = "{$invName} ({$gen} kWh)";
                }
            }

            // Check if curtailment was active on this specific date
            $curtOnDate = $curtailments->first(function ($c) use ($date) {
                $start = Carbon::parse($c->started_at)->startOfDay();
                $end = $c->ended_at ? Carbon::parse($c->ended_at)->endOfDay() : Carbon::now()->endOfDay();
                return $date->betweenIncluded($start, $end);
            });

            $pctOfExpected = $expectedDailyUnits > 0 ? round(($dayTotalGen / $expectedDailyUnits) * 100, 1) : 100;

            // Diagnose Status & Reason
            if ($dayTotalGen >= $lowThreshold) {
                $normalDaysCount++;
                $status = 'normal';
                $statusLabel = 'Normal';
                $badge = '🟢 સામાન્ય (Normal)';
                $reason = 'સામાન્ય ઉત્પાદન (Clear Sunny Day)';
                $reasonEn = 'Normal Generation (Clear Sunny Day)';
                $details = 'બધા ઇન્વર્ટર અને પાવર ગ્રીડ સામાન્ય સ્થિતિમાં સંપૂર્ણ ચાલુ હતા.';
                $detailsEn = 'All inverters and grid operated at normal full power capacity.';
            } else {
                $lowDaysCount++;
                $status = 'low';
                $statusLabel = 'Low Units';

                if ($curtOnDate) {
                    $badge = "⚡ PGVCL {$curtOnDate->percentage}% કટ";
                    $reason = "⚡ PGVCL {$curtOnDate->percentage}% પાવર કટ (Curtailment)";
                    $reasonEn = "PGVCL {$curtOnDate->percentage}% Grid Curtailment Order";
                    $lossMsg = $curtOnDate->total_lost_kwh > 0 ? " (અંદાજિત નુકસાન: ~{$curtOnDate->total_lost_kwh} kWh)" : "";
                    $lossMsgEn = $curtOnDate->total_lost_kwh > 0 ? " (Est. Loss: ~{$curtOnDate->total_lost_kwh} kWh)" : "";
                    $details = "PGVCL Grid Curtailment આદેશ મુજબ પ્લાન્ટનું ઉત્પાદન {$curtOnDate->percentage}% ઘટાડેલું હતું.{$lossMsg}";
                    $detailsEn = "Power generation reduced by {$curtOnDate->percentage}% as per PGVCL grid instructions.{$lossMsgEn}";
                } elseif (!empty($deadInverters)) {
                    $badge = '🔌 ઇન્વર્ટર બંધ/ફોલ્ટ';
                    $reason = "🔌 " . implode(', ', $deadInverters) . " બંધ / ફોલ્ટ (Inverter Fault)";
                    $reasonEn = "Inverter Offline / Tripped: " . implode(', ', $deadInverters);
                    $details = "ચોક્કસ ઇન્વર્ટર બંધ, ઑફલાઇન અથવા ટ્રિપ હોવાના કારણે દૈનિક ઉત્પાદનમાં મોટો ઘટાડો નોંધાયો.";
                    $detailsEn = "Specific inverter was offline or tripped causing heavy generation loss.";
                } elseif (!empty($lowInverters)) {
                    $badge = '🔌 ઇન્વર્ટર લો જનરેશન';
                    $reason = "🔌 " . implode(', ', $lowInverters) . " માં ઓછો પાવર";
                    $reasonEn = "Low Output on Inverter: " . implode(', ', $lowInverters);
                    $details = "આ ઇન્વર્ટરમાં ટેકનિકલ ખામી અથવા સ્ટ્રિંગ ડિસ્કનેક્શનના કારણે ઓછું ઉત્પાદન થયું.";
                    $detailsEn = "Technical issue or string disconnection resulted in reduced generation.";
                } elseif ($dayTotalGen <= ($expectedDailyUnits * 0.35)) {
                    $badge = '🌧️ ભારે વરસાદ / વાદળ';
                    $reason = '🌧️ ભારે વરસાદ / વાદળછાયું વાતાવરણ (Rain & Dense Clouds)';
                    $reasonEn = 'Heavy Rain & Dense Clouds (Weather Issue)';
                    $details = 'આકાશમાં ગાઢ વાદળો અને વરસાદ હોવાથી સૂર્યપ્રકાશ (Solar Irradiance) નહિવત રહ્યો હતો.';
                    $detailsEn = 'Heavy rainfall and dense overcast sky significantly reduced solar irradiance.';
                } elseif ($dayTotalGen <= ($expectedDailyUnits * 0.55)) {
                    $badge = '⛅ વાદળછાયું / ધૂંધળું';
                    $reason = '⛅ વાદળછાયું વાતાવરણ / ધૂંધળો તડકો (Cloudy Day)';
                    $reasonEn = 'Cloudy & Overcast Sky (Weather Issue)';
                    $details = 'દિવસ દરમિયાન સૂર્યપ્રકાશ ઓછો અને વાદળો હોવાથી ઉત્પાદન ઓછું મળ્યું.';
                    $detailsEn = 'Diffuse sunlight and scattered cloud cover reduced overall daily output.';
                } else {
                    $badge = '🧼 પ્લેટો ધૂળ / ઓછો તડકો';
                    $reason = '🧼 પ્લેટો પર ધૂળ-માટી / ઓછો સૂર્યપ્રકાશ (Dust Loss)';
                    $reasonEn = 'Dust on Solar Plates / Hazy Sky (Soiling Loss)';
                    $details = 'સોલાર પ્લેટો ગંદી હોવાના કારણે અથવા વાતાવરણમાં ધૂળના કારણે સૂર્યકિરણો ઓછા મળ્યા.';
                    $detailsEn = 'Dust accumulation on solar panels or air haze reduced panel efficiency.';
                }
            }

            $rows[] = [
                'date' => $dateString,
                'date_formatted' => $date->format('d M Y'),
                'day_name' => $date->format('l'),
                'generation' => $dayTotalGen,
                'expected_generation' => $expectedDailyUnits,
                'pct_of_expected' => $pctOfExpected,
                'status' => $status,
                'status_label' => $statusLabel,
                'badge' => $badge,
                'reason' => $reason,
                'reason_en' => $reasonEn,
                'details' => $details,
                'details_en' => $detailsEn,
                'inverters' => $inverterBreakdown,
            ];
        }

        return [
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'from_formatted' => $from->format('d M Y'),
            'to_formatted' => $to->format('d M Y'),
            'company_id' => $companyId,
            'company_name' => $targetCompany ? $targetCompany->name : 'All Companies (સંયુક્ત પ્લાન્ટ)',
            'total_capacity_kw' => $totalCapacityKw,
            'expected_daily_units' => $expectedDailyUnits,
            'low_threshold_units' => $lowThreshold,
            'total_generation' => round($totalGeneration, 1),
            'total_days' => count($rows),
            'normal_days' => $normalDaysCount,
            'low_days' => $lowDaysCount,
            'missing_days' => $missingDaysCount,
            'rows' => $rows,
        ];
    }
}
