<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'vapid' => [
        'public_key' => env('VAPID_PUBLIC_KEY', 'BA6zohhbg2dSyTQVJUkaTn7edHpiNkoJw7LKoqnqcg02VLdKNUcV6xIJnD9qNuX7VEts22SdTcoJMwJ2HSF-20o'),
        'private_key' => env('VAPID_PRIVATE_KEY', 'TW64rgW30g-kiKJoK0rLupFkZzm_hJks-Y0MVd_1FCY'),
        'subject' => env('VAPID_SUBJECT', 'mailto:admin@solarflow.in'),
    ],

];
