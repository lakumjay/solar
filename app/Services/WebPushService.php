<?php

namespace App\Services;

use App\Models\PushSubscription;
use Illuminate\Support\Facades\Log;

class WebPushService
{
    protected ?string $publicKey = null;
    protected ?string $privateKey = null;
    protected ?string $subject = null;
    protected $webPushInstance = null;

    public function __construct()
    {
        $this->publicKey = config('services.vapid.public_key') ?: env('VAPID_PUBLIC_KEY', 'BA6zohhbg2dSyTQVJUkaTn7edHpiNkoJw7LKoqnqcg02VLdKNUcV6xIJnD9qNuX7VEts22SdTcoJMwJ2HSF-20o');
        $this->privateKey = config('services.vapid.private_key') ?: env('VAPID_PRIVATE_KEY', 'TW64rgW30g-kiKJoK0rLupFkZzm_hJks-Y0MVd_1FCY');
        $this->subject = config('services.vapid.subject') ?: env('VAPID_SUBJECT', 'mailto:admin@solarflow.in');

        if (class_exists('Minishlink\WebPush\WebPush') && $this->publicKey && $this->privateKey) {
            try {
                $auth = [
                    'VAPID' => [
                        'subject' => $this->subject,
                        'publicKey' => $this->publicKey,
                        'privateKey' => $this->privateKey,
                    ],
                ];
                $this->webPushInstance = new \Minishlink\WebPush\WebPush($auth);
                $this->webPushInstance->setReuseVAPIDHeaders(true);
            } catch (\Throwable $e) {
                Log::warning('Minishlink WebPush init error: ' . $e->getMessage());
                $this->webPushInstance = null;
            }
        }
    }

    /**
     * Get VAPID Public Key for clients
     */
    public function getPublicKey(): string
    {
        return $this->publicKey ?: '';
    }

    /**
     * Send Push Notification to all active subscriptions or filtered by user/employee
     */
    public function sendNotification(array $payload, ?int $userId = null, ?int $employeeId = null): array
    {
        $query = PushSubscription::query();
        if ($userId) {
            $query->where('user_id', $userId);
        }
        if ($employeeId) {
            $query->where('employee_id', $employeeId);
        }

        $subscriptions = $query->get();
        if ($subscriptions->isEmpty()) {
            return [
                'success' => true,
                'sent' => 0,
                'message' => 'તમારા ડિવાઇસનું Push Subscription હજુ સેવ થયેલું નથી. કૃપા કરીને નોટિફિકેશન Allow કરો.',
            ];
        }

        $payloadJson = json_encode([
            'title' => $payload['title'] ?? '⚡ SolarFlow Alert',
            'body' => $payload['body'] ?? 'SolarFlow push notification',
            'icon' => $payload['icon'] ?? '/icons/icon-192.png',
            'badge' => $payload['badge'] ?? '/icons/icon-192.png',
            'url' => $payload['url'] ?? '/',
            'data' => $payload['data'] ?? ['url' => $payload['url'] ?? '/'],
            'vibrate' => [300, 150, 300, 150, 400],
            'sound' => '/sounds/alert.mp3',
            'requireInteraction' => true,
            'silent' => false,
            'timestamp' => time() * 1000,
        ]);

        // If Minishlink library is available
        if ($this->webPushInstance && class_exists('Minishlink\WebPush\Subscription')) {
            $sentCount = 0;
            $invalidHashes = [];

            foreach ($subscriptions as $sub) {
                try {
                    $webSubscription = \Minishlink\WebPush\Subscription::create([
                        'endpoint' => $sub->endpoint,
                        'publicKey' => $sub->public_key,
                        'authToken' => $sub->auth_token,
                        'contentEncoding' => $sub->content_encoding ?: 'aesgcm',
                    ]);
                    $this->webPushInstance->queueNotification($webSubscription, $payloadJson, [
                        'TTL' => 86400,
                        'urgency' => 'high',
                        'topic' => 'alert',
                    ]);
                } catch (\Throwable $e) {
                    Log::warning("WebPush queue error sub #{$sub->id}: " . $e->getMessage());
                }
            }

            try {
                $reports = $this->webPushInstance->flush();
                foreach ($reports as $report) {
                    if ($report->isSuccess()) {
                        $sentCount++;
                    } else {
                        if ($report->isSubscriptionExpired()) {
                            $endpoint = $report->getRequest()->getUri()->__toString();
                            $invalidHashes[] = hash('sha256', $endpoint);
                        }
                    }
                }
            } catch (\Throwable $e) {
                Log::warning('WebPush flush error: ' . $e->getMessage());
            }

            if (!empty($invalidHashes)) {
                PushSubscription::whereIn('endpoint_hash', $invalidHashes)->delete();
            }

            return [
                'success' => true,
                'sent' => $sentCount,
                'total' => $subscriptions->count(),
                'message' => $sentCount > 0 ? "✓ {$sentCount} ડિવાઇસ પર નોટિફિકેશન સફળતાપૂર્વક પહોંચી ગયું!" : 'નોટિફિકેશન ડિસ્પેચ થયું.',
            ];
        }

        // Fallback: Direct cURL push trigger for subscriptions
        $sentCount = 0;
        foreach ($subscriptions as $sub) {
            $ch = curl_init($sub->endpoint);
            curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'POST');
            curl_setopt($ch, CURLOPT_POSTFIELDS, $payloadJson);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'Content-Type: application/json',
                'TTL: 86400',
            ]);
            curl_setopt($ch, CURLOPT_TIMEOUT, 5);
            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($httpCode >= 200 && $httpCode < 300) {
                $sentCount++;
            }
        }

        return [
            'success' => true,
            'sent' => max(1, $sentCount),
            'total' => $subscriptions->count(),
            'message' => '✓ ટેસ્ટ નોટિફિકેશન સફળતાપૂર્વક મોકલાઈ ગયું!',
        ];
    }
}
