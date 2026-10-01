<?php

return [
    /*
    |--------------------------------------------------------------------------
    | iSolarCloud Open API Configuration
    |--------------------------------------------------------------------------
    */
    'base_url' => env('ISOLARCLOUD_BASE_URL', 'https://gateway.isolarcloud.in'),
    'auth_url' => env('ISOLARCLOUD_AUTH_URL', 'https://web3.isolarcloud.in/#/authorized-app'),
    'app_key' => env('ISOLARCLOUD_APP_KEY', '52FCCF80A808CEBAF47282E907A09245'),
    'secret_key' => env('ISOLARCLOUD_SECRET_KEY', '6ibhi15mebwz2vgzb3q1kfyxqzm57w2e'),
    'access_key' => env('ISOLARCLOUD_ACCESS_KEY', 's3t14z9fecmgc7buv5ht8bvfandciifb'),
    'sys_code' => env('ISOLARCLOUD_SYS_CODE', '901'),
    'redirect_uri' => env('ISOLARCLOUD_REDIRECT_URI', 'https://www.rns.snwebkarma.in/callback'),
    'application_id' => env('ISOLARCLOUD_APPLICATION_ID', '3799'),
    'default_point_ids' => ['1', '3', '14', '24'],
];
