<?php

namespace App\Http\Controllers;

use App\Models\PushSubscription;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class NotificationController extends Controller
{
    /**
     * Return public VAPID key for Web Push subscription
     */
    public function vapidKey(): JsonResponse
    {
        $publicKey = config('services.webpush.public_key') ?? env('VAPID_PUBLIC_KEY', 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuYtr7E5M8B6gP0K58gQ25678A');
        
        return response()->json([
            'publicKey' => $publicKey,
        ]);
    }

    /**
     * Store or update a user's push subscription
     */
    public function subscribe(Request $request): JsonResponse
    {
        $data = $request->validate([
            'endpoint' => 'required|string',
            'keys.p256dh' => 'nullable|string',
            'keys.auth' => 'nullable|string',
            'contentEncoding' => 'nullable|string',
        ]);

        $user = $request->user();

        $subscription = PushSubscription::updateOrCreate(
            [
                'user_id' => $user->id,
                'endpoint' => $data['endpoint'],
            ],
            [
                'public_key' => $data['keys']['p256dh'] ?? null,
                'auth_token' => $data['keys']['auth'] ?? null,
                'content_encoding' => $data['contentEncoding'] ?? 'aesgcm',
                'notify_readings' => true,
                'notify_attendance' => true,
                'notify_expenses' => true,
                'notify_salaries' => true,
            ]
        );

        return response()->json([
            'status' => 'success',
            'message' => 'Push notification subscription registered successfully.',
            'subscription' => $subscription,
        ]);
    }

    /**
     * Send an instant test notification
     */
    public function sendTest(Request $request): JsonResponse
    {
        $user = $request->user();
        
        $title = $request->input('title', '☀️ SolarFlow Alert');
        $body = $request->input('body', 'Solar monitoring and power auto-switching is active & normal.');
        $icon = '/icons/icon-192.png';
        $url = $request->input('url', '/');

        // Log notification trigger
        Log::info("Notification sent to user {$user->id} ({$user->name}): {$title} - {$body}");

        return response()->json([
            'status' => 'success',
            'message' => 'Notification triggered successfully!',
            'notification' => [
                'title' => $title,
                'body' => $body,
                'icon' => $icon,
                'badge' => $icon,
                'url' => $url,
                'timestamp' => now()->toISOString(),
            ]
        ]);
    }

    /**
     * Get or update notification preferences
     */
    public function preferences(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($request->isMethod('POST')) {
            $data = $request->validate([
                'notify_readings' => 'nullable|boolean',
                'notify_attendance' => 'nullable|boolean',
                'notify_expenses' => 'nullable|boolean',
                'notify_salaries' => 'nullable|boolean',
            ]);

            PushSubscription::where('user_id', $user->id)->update(array_filter($data, fn($v) => !is_null($v)));
        }

        $subscription = PushSubscription::where('user_id', $user->id)->latest()->first();

        return response()->json([
            'subscribed' => (bool) $subscription,
            'preferences' => [
                'notify_readings' => $subscription ? $subscription->notify_readings : true,
                'notify_attendance' => $subscription ? $subscription->notify_attendance : true,
                'notify_expenses' => $subscription ? $subscription->notify_expenses : true,
                'notify_salaries' => $subscription ? $subscription->notify_salaries : true,
            ]
        ]);
    }
}
