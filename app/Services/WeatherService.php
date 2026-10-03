<?php

namespace App\Services;

use Carbon\Carbon;
use Exception;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class WeatherService
{
    /**
     * Get live weather, upcoming rain forecast, smart plate washing advice, storm alerts, heat loss, and hourly solar radiation.
     */
    public function getWeather(float $latitude = 22.201360, float $longitude = 71.494960, string $locationName = 'Sarva, Botad'): array
    {
        $cacheKey = "solar_weather_{$latitude}_{$longitude}_v3";

        return Cache::remember($cacheKey, 300, function () use ($latitude, $longitude, $locationName) {
            try {
                $url = "https://api.open-meteo.com/v1/forecast";
                $response = Http::timeout(8)->get($url, [
                    'latitude' => $latitude,
                    'longitude' => $longitude,
                    'current' => 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_gusts_10m,precipitation',
                    'hourly' => 'precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,shortwave_radiation_instant,temperature_2m',
                    'forecast_days' => 2,
                    'timezone' => 'Asia/Kolkata',
                ]);

                if (! $response->successful()) {
                    return $this->fallbackWeather($locationName);
                }

                $data = $response->json();
                $current = $data['current'] ?? [];
                $hourly = $data['hourly'] ?? [];

                $weatherCode = (int) ($current['weather_code'] ?? 0);
                $tempC = round((float) ($current['temperature_2m'] ?? 32.0), 1);
                $windKmh = round((float) ($current['wind_speed_10m'] ?? 10.0), 1);
                $windGustKmh = round((float) ($current['wind_gusts_10m'] ?? ($windKmh * 1.3)), 1);
                $precipMm = (float) ($current['precipitation'] ?? 0.0);
                $conditionInfo = $this->interpretWeatherCode($weatherCode);

                $now = Carbon::now();
                $currentHourInt = (int) $now->format('H');
                $isCurrentlyRaining = $precipMm > 0.1 || in_array($weatherCode, [51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99]);

                // 1. Rain Analysis (Live & Advance)
                $rainAlert = null;
                $precipProbList = $hourly['precipitation_probability'] ?? [];
                $precipMmList = $hourly['precipitation'] ?? [];
                $hourlyCodes = $hourly['weather_code'] ?? [];
                $hourlyRadiation = $hourly['shortwave_radiation_instant'] ?? [];
                $hourlyTemps = $hourly['temperature_2m'] ?? [];

                if ($isCurrentlyRaining) {
                    $stopHourIndex = null;
                    for ($i = 1; $i < min(24, count($precipMmList)); $i++) {
                        $pMm = $precipMmList[$i] ?? 0.0;
                        $pProb = $precipProbList[$i] ?? 0;
                        if ($pMm < 0.1 && $pProb < 30) {
                            $stopHourIndex = $i;
                            break;
                        }
                    }

                    $stopTimeStr = $stopHourIndex !== null
                        ? $now->copy()->addHours($stopHourIndex)->format('h:i A')
                        : $now->copy()->addHours(2)->format('h:i A');

                    $rainAlert = [
                        'active' => true,
                        'status' => 'raining_now',
                        'title' => '🌧️ લાઈવ વરસાદ ચાલુ છે (Rain Ongoing)',
                        'start_time' => 'અત્યારે ચાલુ છે',
                        'stop_time' => $stopTimeStr,
                        'probability' => 100,
                        'message' => "તમારા પ્લાન્ટ પર અત્યારે વરસાદ ચાલુ છે. અંદાજે {$stopTimeStr} વાગ્યા સુધીમાં વરસાદ રોકાવાની સંભાવના છે.",
                    ];
                } else {
                    for ($i = 1; $i < min(12, count($precipProbList)); $i++) {
                        $prob = $precipProbList[$i] ?? 0;
                        $code = $hourlyCodes[$i] ?? 0;
                        $isRainCode = in_array($code, [51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99]);

                        if ($prob >= 35 || $isRainCode) {
                            $startTime = $now->copy()->addHours($i)->format('h:i A');
                            $stopTime = $now->copy()->addHours($i + 2)->format('h:i A');

                            $rainAlert = [
                                'active' => true,
                                'status' => 'rain_predicted',
                                'title' => "🌧️ વરસાદની એડવાન્સ ચેતવણી (Rain Advance Alert - {$prob}% શક્યતા)",
                                'hours_away' => $i,
                                'start_time' => $startTime,
                                'stop_time' => $stopTime,
                                'probability' => $prob,
                                'message' => "આગામી ~{$i} કલાકમાં ({$startTime} આસપાસ) વરસાદ આવવાની સંભાવના છે ({$prob}% શક્યતા). અંદાજે {$stopTime} સુધી રહેવાની શક્યતા છે.",
                            ];
                            break;
                        }
                    }
                }

                // 2. High Wind Storm & Plant Safety Warning
                $stormAlert = null;
                $isHighWind = ($windKmh >= 35.0 || $windGustKmh >= 45.0);
                $isThunderstorm = in_array($weatherCode, [95, 96, 99]);

                if ($isHighWind || $isThunderstorm) {
                    $stormAlert = [
                        'active' => true,
                        'wind_speed' => "{$windKmh} km/h",
                        'wind_gusts' => "{$windGustKmh} km/h",
                        'title' => '🚨 તેજ પવન / વાવાઝોડું સુરક્ષા એલર્ટ (High Wind Warning)',
                        'message' => "પ્લાન્ટ પર પવનની ગતિ {$windKmh} km/h (ઝાટકા {$windGustKmh} km/h) પહોંચી છે. સોલાર પેનલ સ્ટ્રક્ચર, મોડ્યુલ ક્લેમ્પ્સ અને વાયરીંગ સુરક્ષિત છે કે નહીં તે તાત્કાલિક ચકાસો!",
                    ];
                }

                // 3. Smart Plate Washing Recommendation (આગામી 48 કલાક વેધર આધારિત સલાહ)
                $next48hRainMaxProb = 0;
                $rainHoursAhead = null;
                for ($i = 0; $i < min(48, count($precipProbList)); $i++) {
                    $prob = $precipProbList[$i] ?? 0;
                    if ($prob > $next48hRainMaxProb) {
                        $next48hRainMaxProb = $prob;
                    }
                    if ($prob >= 40 && $rainHoursAhead === null) {
                        $rainHoursAhead = $i;
                    }
                }

                if ($isCurrentlyRaining) {
                    $washingAdvice = [
                        'can_wash' => false,
                        'status' => 'raining_now',
                        'badge' => '🌧️ વરસાદ ચાલુ છે',
                        'title' => 'પ્લેટો ધોવાની જરૂર નથી (વરસાદ ચાલુ છે)',
                        'message' => 'પ્લાન્ટ પર કુદરતી વરસાદથી પ્લેટો સાફ થઈ રહી છે. વધારાનું પાણી અને મજૂરી ખર્ચ બચાવો.',
                        'theme' => 'info',
                    ];
                } elseif ($next48hRainMaxProb >= 40 && $rainHoursAhead !== null) {
                    $rainTimeStr = $now->copy()->addHours($rainHoursAhead)->format('d M, h:i A');
                    $washingAdvice = [
                        'can_wash' => false,
                        'status' => 'rain_expected',
                        'badge' => '🌧️ વરસાદની આગાહી (' . $next48hRainMaxProb . '%)',
                        'title' => 'પ્લેટો ધોવાનો ખર્ચ બચાવો',
                        'message' => "આગામી {$rainHoursAhead} કલાકમાં ({$rainTimeStr} આસપાસ) વરસાદની {$next48hRainMaxProb}% શક્યતા છે. અત્યારે પ્લેટો ધોવાની જરૂર નથી.",
                        'theme' => 'warning',
                    ];
                } else {
                    $washingAdvice = [
                        'can_wash' => true,
                        'status' => 'good_to_wash',
                        'badge' => '☀️ ઉત્તમ હવામાન',
                        'title' => 'પ્લેટો ધોવા માટે અનુકૂળ સમય',
                        'message' => 'આગામી ૪૮ કલાકમાં વરસાદની કોઈ શક્યતા નથી અને સ્વચ્છ તડકો રહેશે. પ્લેટો સાફ કરવાથી મહત્તમ જનરેશન મળશે.',
                        'theme' => 'success',
                    ];
                }

                // 4. Solar Irradiance & Temperature Heat Loss Analysis
                $radiationNow = (float) ($hourlyRadiation[0] ?? 750.0);
                $radiationNext = (float) ($hourlyRadiation[1] ?? 700.0);

                // Cell Temperature Estimate: T_cell = T_amb + (Irradiance / 800) * 28°C
                $cellTempC = round($tempC + ($radiationNow / 800.0) * 28.0, 1);
                // Standard STC is 25°C, Temp coefficient ~ -0.38%/°C
                $heatLossPct = $cellTempC > 25.0 ? round(($cellTempC - 25.0) * 0.38, 1) : 0.0;

                $heatLossAnalysis = [
                    'ambient_temp_c' => $tempC,
                    'cell_temp_c' => $cellTempC,
                    'heat_loss_pct' => $heatLossPct,
                    'loss_status' => $heatLossPct > 12.0 ? 'high' : ($heatLossPct > 6.0 ? 'moderate' : 'low'),
                    'title' => "તાપમાન કારણે પાવર લોસ: -{$heatLossPct}%",
                    'description' => "પેનલ સેલ તાપમાન ~{$cellTempC}°C છે, જેથી ગરમીના લીધે અંદાજે {$heatLossPct}% પાવર લોસ થાય છે.",
                ];

                // 5. Hourly Radiation Profile for Today (Daylight 06:00 to 18:30)
                $hourlyDaylightProfile = [];
                for ($h = 6; $h <= 18; $h++) {
                    $indexOffset = $h - $currentHourInt;
                    $rad = 0;
                    if ($indexOffset >= 0 && isset($hourlyRadiation[$indexOffset])) {
                        $rad = max(0, (float) $hourlyRadiation[$indexOffset]);
                    } elseif ($indexOffset < 0) {
                        // Past hour estimation for curve continuity
                        $sunFactor = sin(deg2rad(max(0, min(180, ($h - 6) * 15))));
                        $rad = round($sunFactor * 850, 0);
                    }
                    $hourlyDaylightProfile[$h] = [
                        'hour' => $h,
                        'time_label' => Carbon::createFromTime($h, 0)->format('h A'),
                        'radiation_w_m2' => round($rad, 0),
                    ];
                }

                return [
                    'temp' => "{$tempC}°C",
                    'temperature_num' => $tempC,
                    'condition' => $conditionInfo['label'],
                    'type' => $conditionInfo['type'],
                    'icon' => $conditionInfo['icon'],
                    'wind' => "{$windKmh} km/h",
                    'wind_kmh' => $windKmh,
                    'wind_gusts_kmh' => $windGustKmh,
                    'location' => $locationName,
                    'solar_irradiance' => $radiationNow,
                    'solar_irradiance_next' => $radiationNext,
                    'rain_alert' => $rainAlert,
                    'storm_alert' => $stormAlert,
                    'washing_advice' => $washingAdvice,
                    'heat_loss' => $heatLossAnalysis,
                    'hourly_daylight_profile' => $hourlyDaylightProfile,
                ];
            } catch (Exception $e) {
                Log::warning('Weather fetch error', ['error' => $e->getMessage()]);
                return $this->fallbackWeather($locationName);
            }
        });
    }

    private function interpretWeatherCode(int $code): array
    {
        if ($code === 0) {
            return ['label' => 'Sunny', 'type' => 'sunny', 'icon' => 'sun'];
        }
        if (in_array($code, [1, 2])) {
            return ['label' => 'Mostly Sunny', 'type' => 'sunny', 'icon' => 'sun-medium'];
        }
        if ($code === 3) {
            return ['label' => 'Cloudy', 'type' => 'cloudy', 'icon' => 'cloud'];
        }
        if (in_array($code, [45, 48])) {
            return ['label' => 'Foggy', 'type' => 'cloudy', 'icon' => 'cloud-fog'];
        }
        if (in_array($code, [51, 53, 55, 61, 63, 65, 80, 81, 82])) {
            return ['label' => 'Rainy', 'type' => 'rain', 'icon' => 'cloud-rain'];
        }
        if (in_array($code, [95, 96, 99])) {
            return ['label' => 'Thunderstorm', 'type' => 'storm', 'icon' => 'cloud-lightning'];
        }

        return ['label' => 'Clear', 'type' => 'sunny', 'icon' => 'sun'];
    }

    private function fallbackWeather(string $locationName): array
    {
        return [
            'temp' => '32°C',
            'temperature_num' => 32.0,
            'condition' => 'Sunny',
            'type' => 'sunny',
            'icon' => 'sun',
            'wind' => '12 km/h',
            'wind_kmh' => 12.0,
            'wind_gusts_kmh' => 16.0,
            'location' => $locationName,
            'solar_irradiance' => 750.0,
            'solar_irradiance_next' => 720.0,
            'rain_alert' => null,
            'storm_alert' => null,
            'washing_advice' => [
                'can_wash' => true,
                'status' => 'good_to_wash',
                'badge' => '☀️ ઉત્તમ હવામાન',
                'title' => 'પ્લેટો ધોવા માટે અનુકૂળ સમય',
                'message' => 'આગામી સમયમાં સારો તડકો રહેશે. પ્લેટો સાફ કરવાથી મહત્તમ જનરેશન મળશે.',
                'theme' => 'success',
            ],
            'heat_loss' => [
                'ambient_temp_c' => 32.0,
                'cell_temp_c' => 58.0,
                'heat_loss_pct' => 12.5,
                'loss_status' => 'moderate',
                'title' => 'તાપમાન કારણે પાવર લોસ: -12.5%',
                'description' => 'પેનલ સેલ તાપમાન ~58°C છે, જેથી ગરમીના લીધે અંદાજે 12.5% પાવર લોસ થાય છે.',
            ],
            'hourly_daylight_profile' => [],
        ];
    }
}
