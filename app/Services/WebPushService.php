<?php

namespace App\Services;

use App\Models\PushSubscription;
use App\Models\User;
use Illuminate\Support\Facades\Log;
use Minishlink\WebPush\Subscription;
use Minishlink\WebPush\WebPush;

class WebPushService
{
    protected ?WebPush $webPush = null;

    public function __construct()
    {
        $publicKey = config('services.vapid.public_key') ?: env('VAPID_PUBLIC_KEY');
        $privateKey = config('services.vapid.private_key') ?: env('VAPID_PRIVATE_KEY');
        $subject = config('services.vapid.subject') ?: env('VAPID_SUBJECT', 'mailto:admin@solarflow.in');

        if ($publicKey && $privateKey) {
            $auth = [
                'VAPID' => [
                    'subject' => $subject,
                    'publicKey' => $publicKey,
                    'privateKey' => $privateKey,
                ],
            ];

            $this->webPush = new WebPush($auth);
            $this->webPush->setReuseVAPIDHeaders(true);
        }
    }

    /**
     * Get VAPID Public Key for clients
     */
    public function getPublicKey(): string
    {
        return config('services.vapid.public_key') ?: env('VAPID_PUBLIC_KEY', '');
    }

    /**
     * Send Push Notification to all active subscriptions or filtered by user/employee
     */
    public function sendNotification(array $payload, ?int $userId = null, ?int $employeeId = null): array
    {
        if (!$this->webPush) {
            Log::warning('WebPush is not configured with valid VAPID keys.');
            return ['success' => false, 'sent' => 0, 'error' => 'WebPush not configured with VAPID keys'];
        }

        $query = PushSubscription::query();
        if ($userId) {
            $query->where('user_id', $userId);
        }
        if ($employeeId) {
            $query->where('employee_id', $employeeId);
        }

        $subscriptions = $query->get();
        if ($subscriptions->isEmpty()) {
            return ['success' => true, 'sent' => 0, 'message' => 'No active subscriptions found'];
        }

        $payloadJson = json_encode([
            'title' => $payload['title'] ?? '⚡ SolarFlow Alert',
            'body' => $payload['body'] ?? 'New notification from SolarFlow system',
            'icon' => $payload['icon'] ?? '/icons/icon-192.png',
            'badge' => $payload['badge'] ?? '/icons/icon-192.png',
            'url' => $payload['url'] ?? '/',
            'data' => $payload['data'] ?? ['url' => $payload['url'] ?? '/'],
            'timestamp' => time() * 1000,
        ]);

        $sentCount = 0;
        $invalidIds = [];

        foreach ($subscriptions as $sub) {
            try {
                $webSubscription = Subscription::create([
                    'endpoint' => $sub->endpoint,
                    'publicKey' => $sub->public_key,
                    'authToken' => $sub->auth_token,
                    'contentEncoding' => $sub->content_encoding ?: 'aesgcm',
                ]);

                $this->webPush->queueNotification($webSubscription, $payloadJson);
            } catch (\Throwable $e) {
                Log::warning("Failed to queue push notification for sub #{$sub->id}: " . $e->getMessage());
            }
        }

        $reports = $this->webPush->flush();
        foreach ($reports as $report) {
            $endpoint = $report->getRequest()->getUri()->__toString();
            $endpointHash = hash('sha256', $endpoint);

            if ($report->isSuccess()) {
                $sentCount++;
            } else {
                Log::info("WebPush failed for endpoint: {$report->getReason()}");
                if ($report->isSubscriptionExpired()) {
                    $invalidIds[] = $endpointHash;
                }
            }
        }

        if (!empty($invalidIds)) {
            PushSubscription::whereIn('endpoint_hash', $invalidIds)->delete();
        }

        return [
            'success' => true,
            'sent' => $sentCount,
            'total' => $subscriptions->count(),
        ];
    }
}
