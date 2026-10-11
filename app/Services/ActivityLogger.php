<?php

namespace App\Services;

use App\Models\ActivityLog;
use App\Models\User;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

class ActivityLogger
{
    private static ?array $columns = null;

    private static function getColumns(): array
    {
        if (self::$columns === null) {
            try {
                self::$columns = Schema::getColumnListing('activity_logs');
            } catch (\Throwable) {
                self::$columns = ['id', 'user_id', 'company_id', 'action', 'subject_type', 'subject_id', 'description', 'changes', 'created_at', 'updated_at'];
            }
        }
        return self::$columns;
    }

    public function log(
        User $actor,
        ?int $companyId,
        string $action,
        string $type,
        ?int $subjectId,
        string $description,
        array $changes = [],
        ?array $oldValues = null,
        ?array $newValues = null
    ): ?ActivityLog {
        $request = request();
        $ip = null;
        $ua = null;

        if ($request) {
            $ip = $request->header('CF-Connecting-IP')
                ?? $request->header('X-Forwarded-For')
                ?? $request->ip();

            if ($ip && str_contains($ip, ',')) {
                $ip = trim(explode(',', $ip)[0]);
            }
            $ua = $request->userAgent();
        }

        $deviceInfo = self::parseUserAgent($ua);

        try {
            $data = [
                'user_id' => $actor->id,
                'company_id' => $companyId,
                'action' => $action,
                'subject_type' => $type,
                'subject_id' => $subjectId,
                'description' => $description,
                'changes' => $changes,
            ];

            $available = self::getColumns();
            if (in_array('old_values', $available, true)) {
                $data['old_values'] = $oldValues;
            }
            if (in_array('new_values', $available, true)) {
                $data['new_values'] = $newValues;
            }
            if (in_array('ip_address', $available, true)) {
                $data['ip_address'] = $ip ?: '127.0.0.1';
            }
            if (in_array('user_agent', $available, true)) {
                $data['user_agent'] = $ua ? substr($ua, 0, 500) : null;
            }
            if (in_array('device', $available, true)) {
                $data['device'] = $deviceInfo['device'] ?? 'Unknown Device';
            }
            if (in_array('platform', $available, true)) {
                $data['platform'] = $deviceInfo['platform'] ?? 'Unknown OS';
            }
            if (in_array('browser', $available, true)) {
                $data['browser'] = $deviceInfo['browser'] ?? 'Unknown Browser';
            }

            return ActivityLog::create($data);
        } catch (\Throwable $e) {
            Log::warning('ActivityLogger failed to record log: ' . $e->getMessage());
            return null;
        }
    }

    public static function parseUserAgent(?string $ua): array
    {
        if (empty($ua)) {
            return [
                'device' => 'System / Local',
                'platform' => 'System Server',
                'browser' => 'System Background',
                'type' => 'server',
            ];
        }

        // Platform detection
        $platform = 'Unknown OS';
        if (preg_match('/iPhone/i', $ua)) {
            if (preg_match('/OS ([\d_]+)/i', $ua, $matches)) {
                $platform = 'iOS ' . str_replace('_', '.', $matches[1]);
            } else {
                $platform = 'iOS';
            }
        } elseif (preg_match('/iPad/i', $ua)) {
            if (preg_match('/OS ([\d_]+)/i', $ua, $matches)) {
                $platform = 'iPadOS ' . str_replace('_', '.', $matches[1]);
            } else {
                $platform = 'iPadOS';
            }
        } elseif (preg_match('/Android\s*([\d\.]+)?/i', $ua, $matches)) {
            $platform = 'Android ' . ($matches[1] ?? '');
        } elseif (preg_match('/Macintosh|Mac OS X\s*([\d_\.]+)?/i', $ua, $matches)) {
            $ver = isset($matches[1]) ? str_replace('_', '.', $matches[1]) : '';
            $platform = 'macOS ' . $ver;
        } elseif (preg_match('/Windows NT 10.0/i', $ua)) {
            $platform = 'Windows 10/11';
        } elseif (preg_match('/Windows NT 6.3/i', $ua)) {
            $platform = 'Windows 8.1';
        } elseif (preg_match('/Windows NT 6.1/i', $ua)) {
            $platform = 'Windows 7';
        } elseif (preg_match('/Linux/i', $ua)) {
            $platform = 'Linux';
        }

        // Device Model detection
        $device = 'Desktop PC';
        $type = 'desktop';
        if (preg_match('/iPhone/i', $ua)) {
            $device = 'Apple iPhone';
            $type = 'mobile';
        } elseif (preg_match('/iPad/i', $ua)) {
            $device = 'Apple iPad';
            $type = 'tablet';
        } elseif (preg_match('/Android/i', $ua)) {
            $type = 'mobile';
            if (preg_match('/;\s*([A-Za-z0-9_\-\s]+)\s+Build/i', $ua, $matches)) {
                $rawModel = trim($matches[1]);
                if (preg_match('/SM-[A-Za-z0-9]+/i', $rawModel)) {
                    $device = 'Samsung ' . $rawModel;
                } elseif (preg_match('/Pixel/i', $rawModel)) {
                    $device = 'Google ' . $rawModel;
                } elseif (preg_match('/OnePlus|CPH|NE22/i', $rawModel)) {
                    $device = 'OnePlus ' . $rawModel;
                } elseif (preg_match('/Redmi|Xiaomi|POCO|2\d{3}/i', $rawModel)) {
                    $device = 'Xiaomi ' . $rawModel;
                } elseif (preg_match('/vivo|V2\d{3}/i', $rawModel)) {
                    $device = 'Vivo ' . $rawModel;
                } elseif (preg_match('/OPPO|CPH\d{4}/i', $rawModel)) {
                    $device = 'Oppo ' . $rawModel;
                } elseif (preg_match('/Realme|RMX\d{4}/i', $rawModel)) {
                    $device = 'Realme ' . $rawModel;
                } else {
                    $device = 'Android (' . $rawModel . ')';
                }
            } else {
                $device = 'Android Phone';
            }
        } elseif (preg_match('/Macintosh/i', $ua)) {
            $device = 'Apple Mac';
            $type = 'desktop';
        } elseif (preg_match('/Windows/i', $ua)) {
            $device = 'Windows PC';
            $type = 'desktop';
        }

        // Browser detection
        $browser = 'Browser';
        if (preg_match('/Edg\/([\d\.]+)/i', $ua, $matches)) {
            $browser = 'Edge ' . explode('.', $matches[1])[0];
        } elseif (preg_match('/Chrome\/([\d\.]+)/i', $ua, $matches)) {
            $browser = 'Chrome ' . explode('.', $matches[1])[0];
        } elseif (preg_match('/Firefox\/([\d\.]+)/i', $ua, $matches)) {
            $browser = 'Firefox ' . explode('.', $matches[1])[0];
        } elseif (preg_match('/Safari\/([\d\.]+)/i', $ua) && preg_match('/Version\/([\d\.]+)/i', $ua, $matches)) {
            $browser = 'Safari ' . explode('.', $matches[1])[0];
        } elseif (preg_match('/Mobile Safari/i', $ua)) {
            $browser = 'Mobile Safari';
        }

        return [
            'device' => trim($device),
            'platform' => trim($platform),
            'browser' => trim($browser),
            'type' => $type,
        ];
    }
}
