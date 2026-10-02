<?php

namespace App\Http\Controllers;

use App\Models\Employee;
use App\Models\PushSubscription;
use App\Services\WebPushService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PushNotificationController extends Controller
{
    public function __construct(
        protected WebPushService $webPushService
    ) {}

    /**
     * Get VAPID Public Key for client subscription
     */
    public function publicKey(): JsonResponse
    {
        return response()->json([
            'publicKey' => $this->webPushService->getPublicKey(),
        ]);
    }

    /**
     * Subscribe client device to Web Push
     */
    public function subscribe(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'endpoint' => 'required|string',
            'keys' => 'required|array',
            'keys.p256dh' => 'required|string',
            'keys.auth' => 'required|string',
            'contentEncoding' => 'nullable|string',
        ]);

        $user = $request->user();
        $employee = Employee::where('user_id', $user->id)->first();
        $endpoint = $validated['endpoint'];
        $endpointHash = hash('sha256', $endpoint);

        $subscription = PushSubscription::updateOrCreate(
            ['endpoint_hash' => $endpointHash],
            [
                'user_id' => $user->id,
                'employee_id' => $employee?->id,
                'endpoint' => $endpoint,
                'public_key' => $validated['keys']['p256dh'],
                'auth_token' => $validated['keys']['auth'],
                'content_encoding' => $validated['contentEncoding'] ?? 'aesgcm',
                'user_agent' => $request->userAgent(),
                'last_active_at' => now(),
            ]
        );

        return response()->json([
            'message' => 'Push notification subscription saved successfully.',
            'subscription_id' => $subscription->id,
        ]);
    }

    /**
     * Send test push notification
     */
    public function sendTest(Request $request): JsonResponse
    {
        $user = $request->user();
        $payload = [
            'title' => $request->input('title', '⚡ SolarFlow Live Alert'),
            'body' => $request->input('body', 'Your background push notifications are 100% active and working even if the app is closed!'),
            'icon' => '/icons/icon-192.png',
            'badge' => '/icons/icon-192.png',
            'url' => '/',
        ];

        // Send to current user subscription
        $result = $this->webPushService->sendNotification($payload, $user->id);

        return response()->json([
            'message' => $result['sent'] > 0 ? 'Push notification delivered!' : 'No active subscription or failed delivery.',
            'details' => $result,
        ]);
    }

    /**
     * Broadcast notification to all or selected users/employees
     */
    public function broadcast(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'title' => 'required|string|max:120',
            'body' => 'required|string|max:300',
            'url' => 'nullable|string',
            'target_employee_id' => 'nullable|integer',
        ]);

        $result = $this->webPushService->sendNotification(
            [
                'title' => $validated['title'],
                'body' => $validated['body'],
                'url' => $validated['url'] ?? '/',
            ],
            null,
            $validated['target_employee_id'] ?? null
        );

        return response()->json([
            'message' => "Notification dispatched to {$result['sent']} device(s).",
            'details' => $result,
        ]);
    }
}
