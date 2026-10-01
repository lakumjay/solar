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
     * Get live weather, upcoming rain forecast, stop/start times, storm alerts, and solar irradiance.
     */
    public function getWeather(float $latitude = 22.201360, float $longitude = 71.494960, string $locationName = 'Sarva, Botad'): array
    {
        $cacheKey = "solar_weather_{$latitude}_{$longitude}_v2";

        return Cache::remember($cacheKey, 300, function () use ($latitude, $longitude, $locationName) {
            try {
                $url = "https://api.open-meteo.com/v1/forecast";
                $response = Http::timeout(8)->get($url, [
                    'latitude' => $latitude,
                    'longitude' => $longitude,
                    'current' => 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_gusts_10m,precipitation',
                    'hourly' => 'precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,shortwave_radiation_instant',
                    'forecast_hours' => 12,
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
                $isCurrentlyRaining = $precipMm > 0.1 || in_array($weatherCode, [51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99]);

                // 1. Rain Analysis (Start time, Stop time, Probability)
                $rainAlert = null;
                $precipProbList = $hourly['precipitation_probability'] ?? [];
                $precipMmList = $hourly['precipitation'] ?? [];
                $hourlyCodes = $hourly['weather_code'] ?? [];

                if ($isCurrentlyRaining) {
                    // Rain is currently active -> Find when it will stop
                    $stopHourIndex = null;
                    for ($i = 1; $i < count($precipMmList); $i++) {
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
                    // Check upcoming rain in the next 1 to 6 hours
                    for ($i = 1; $i < min(7, count($precipProbList)); $i++) {
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

                // 2. High Wind Storm & Plant Damage Warning
                $stormAlert = null;
                $isHighWind = ($windKmh >= 40.0 || $windGustKmh >= 50.0);
                $isThunderstorm = in_array($weatherCode, [95, 96, 99]);

                if ($isHighWind || $isThunderstorm) {
                    $stormAlert = [
                        'active' => true,
                        'wind_speed' => "{$windKmh} km/h",
                        'wind_gusts' => "{$windGustKmh} km/h",
                        'title' => '🚨 અતિભારે વાવાઝોડું ચેતવણી (Severe High Wind Storm Alert)',
                        'message' => "પ્લાન્ટ લોકેશન પર તેજ પવનની ઝડપ {$windKmh} km/h (ઝાટકા {$windGustKmh} km/h) પહોંચી છે. સોલાર પેનલ સ્ટ્રક્ચર, મોડ્યુલ ક્લેમ્પ્સ અને વાયરીંગ તાત્કાલિક સુરક્ષિત કરો - પ્લાન્ટને નુકસાન થઈ શકે છે!",
                    ];
                }

                // Solar irradiance for next 1 hour prediction
                $radiationNow = (float) ($hourly['shortwave_radiation_instant'][0] ?? 750.0);
                $radiationNext = (float) ($hourly['shortwave_radiation_instant'][1] ?? 700.0);

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
        ];
    }
}
