<?php

return [
    'seed' => [
        'super_admin_email' => env('SOLARFLOW_ADMIN_EMAIL', 'admin@solar.local'),
        'super_admin_password' => env('SOLARFLOW_ADMIN_PASSWORD', 'password'),
        'company_user_password' => env('SOLARFLOW_COMPANY_PASSWORD', 'password'),
    ],
];
