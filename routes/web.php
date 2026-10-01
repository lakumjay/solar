<?php

use App\Http\Controllers\ActivityController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\CompanyController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\ImportController;
use App\Http\Controllers\InverterController;
use App\Http\Controllers\ReadingController;
use App\Http\Controllers\ReportController;
use App\Http\Controllers\UserController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

Route::prefix('api')->group(function () {
    Route::post('login', [AuthController::class, 'login']);
    Route::middleware('auth')->group(function () {
        Route::get('me', [AuthController::class, 'me']);
        Route::post('logout', [AuthController::class, 'logout']);
        Route::get('companies', [CompanyController::class, 'index']);
        Route::post('companies', [CompanyController::class, 'store']);
        Route::get('companies/{company}/logo', [CompanyController::class, 'logo'])->name('companies.logo');
        Route::post('inverters', [InverterController::class, 'store']);
        Route::get('users', [UserController::class, 'index']);
        Route::post('users', [UserController::class, 'store']);
        Route::get('dashboard', [DashboardController::class, 'show']);
        Route::get('readings', [ReadingController::class, 'index']);
        Route::post('readings', [ReadingController::class, 'store']);
        Route::get('report', [ReportController::class, 'show']);
        Route::get('report/export/excel', [ReportController::class, 'excel']);
        Route::get('report/export/pdf', [ReportController::class, 'pdf']);
        Route::post('import/excel', [ImportController::class, 'store']);
        Route::get('activity', [ActivityController::class, 'index']);
    });
});
