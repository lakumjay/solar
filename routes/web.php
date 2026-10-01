<?php

use App\Http\Controllers\ActivityController;
use App\Http\Controllers\AttendanceController;
use App\Http\Controllers\AttendanceReportController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\CompanyController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\EmployeeController;
use App\Http\Controllers\HolidayController;
use App\Http\Controllers\ImportController;
use App\Http\Controllers\InverterController;
use App\Http\Controllers\LeaveController;
use App\Http\Controllers\ReadingController;
use App\Http\Controllers\ReportController;
use App\Http\Controllers\SalaryController;
use App\Http\Controllers\SharedExpenseController;
use App\Http\Controllers\StockBorrowingController;
use App\Http\Controllers\StockItemController;
use App\Http\Controllers\UserController;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

Route::get('/login', function () {
    return redirect('/');
})->name('login');

Route::prefix('api')->group(function () {
    Route::post('login', [AuthController::class, 'login']);
    Route::get('notifications/vapid-key', [\App\Http\Controllers\NotificationController::class, 'vapidKey']);
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
        Route::get('report/export/daily-ss-excel', [ReportController::class, 'dailySsExcel']);
        Route::get('report/export/company-excel', [ReportController::class, 'companyExcel']);
        Route::get('report/export/pdf', [ReportController::class, 'pdf']);
        Route::post('import/excel', [ImportController::class, 'store']);
        Route::get('activity', [ActivityController::class, 'index']);
        Route::get('employees', [EmployeeController::class, 'index']);
        Route::post('employees', [EmployeeController::class, 'store']);
        Route::get('employees/{employee}/photo', [EmployeeController::class, 'photo'])->name('employees.photo');
        Route::get('attendance/today', [AttendanceController::class, 'today']);
        Route::get('attendance/mine', [AttendanceController::class, 'mine']);
        Route::post('attendance/clock-in', [AttendanceController::class, 'clockIn']);
        Route::post('attendance/clock-out', [AttendanceController::class, 'clockOut']);
        Route::post('attendance/break-in', [AttendanceController::class, 'startBreak']);
        Route::post('attendance/break-out', [AttendanceController::class, 'endBreak']);
        Route::post('attendance/manual', [AttendanceController::class, 'manual']);
        Route::get('attendance/breaks/{attendanceBreak}/selfie', [AttendanceController::class, 'breakSelfie'])->name('attendance.break-selfie');
        Route::get('attendance', [AttendanceController::class, 'index']);
        Route::post('attendance/{attendanceRecord}/correct', [AttendanceController::class, 'correct']);
        Route::get('attendance/{attendanceRecord}/selfie', [AttendanceController::class, 'selfie'])->name('attendance.selfie');
        Route::get('holidays', [HolidayController::class, 'index']);
        Route::post('holidays', [HolidayController::class, 'store']);
        Route::get('leave-types', [LeaveController::class, 'types']);
        Route::get('leaves/mine', [LeaveController::class, 'mine']);
        Route::post('leaves', [LeaveController::class, 'store']);
        Route::get('leaves', [LeaveController::class, 'index']);
        Route::post('leaves/{leaveRequest}/review', [LeaveController::class, 'review']);
        Route::get('attendance-report', [AttendanceReportController::class, 'show']);
        Route::get('attendance-report/export/excel', [AttendanceReportController::class, 'excel']);
        Route::get('attendance-report/export/pdf', [AttendanceReportController::class, 'pdf']);
        Route::get('salaries', [SalaryController::class, 'index']);
        Route::get('salaries/export/excel', [SalaryController::class, 'excel']);
        Route::get('my-salary', [SalaryController::class, 'mine']);
        Route::get('employees/{employee}/salary-rates', [SalaryController::class, 'rates']);
        Route::post('employees/{employee}/salary-rates', [SalaryController::class, 'storeRate']);
        Route::post('salary-adjustments', [SalaryController::class, 'storeAdjustment']);
        Route::post('salary-adjustments/{adjustment}/cancel', [SalaryController::class, 'cancelAdjustment']);
        Route::get('stock/items', [StockItemController::class, 'index']);
        Route::post('stock/items', [StockItemController::class, 'store']);
        Route::post('stock/items/{stockItem}/add', [StockItemController::class, 'add']);
        Route::get('stock/items/{stockItem}/image', [StockItemController::class, 'image'])->name('stock.items.image');
        Route::get('stock/borrowings', [StockBorrowingController::class, 'index']);
        Route::post('stock/borrowings', [StockBorrowingController::class, 'store']);
        Route::post('stock/borrowings/{stockBorrowing}/returns', [StockBorrowingController::class, 'receive']);
        Route::get('stock/people', [StockBorrowingController::class, 'people']);
        Route::get('expenses', [SharedExpenseController::class, 'index']);
        Route::get('expenses/export/excel', [SharedExpenseController::class, 'excel']);
        Route::post('expense-percentages', [SharedExpenseController::class, 'percentages']);
        Route::post('expenses', [SharedExpenseController::class, 'store']);
        Route::post('expenses/{expense}', [SharedExpenseController::class, 'update']);
        Route::post('expenses/{expense}/cancel', [SharedExpenseController::class, 'cancel']);
        Route::post('expense-settlements', [SharedExpenseController::class, 'settle']);
        Route::get('expenses/{expense}/receipt', [SharedExpenseController::class, 'receipt'])->name('expenses.receipt');

        // iSolarCloud IoT integration
        Route::get('isolarcloud/status', [\App\Http\Controllers\ISolarCloudController::class, 'status']);
        Route::post('isolarcloud/fetch-now', [\App\Http\Controllers\ISolarCloudController::class, 'fetchNow']);
        Route::post('isolarcloud/save-auth', [\App\Http\Controllers\ISolarCloudController::class, 'saveAuth']);
        Route::post('isolarcloud/toggle-source', [\App\Http\Controllers\ISolarCloudController::class, 'toggleSource']);

        // Push Notifications
        Route::post('notifications/subscribe', [\App\Http\Controllers\NotificationController::class, 'subscribe']);
        Route::post('notifications/test', [\App\Http\Controllers\NotificationController::class, 'sendTest']);
        Route::match(['get', 'post'], 'notifications/preferences', [\App\Http\Controllers\NotificationController::class, 'preferences']);
    });
});

