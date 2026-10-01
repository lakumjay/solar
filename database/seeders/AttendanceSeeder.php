<?php

namespace Database\Seeders;

use App\Models\LeaveType;
use Illuminate\Database\Seeder;

class AttendanceSeeder extends Seeder
{
    public function run(): void
    {
        $general = LeaveType::updateOrCreate(['name' => 'General Leave'], ['paid' => true, 'active' => true]);
        LeaveType::whereKeyNot($general->id)->delete();
    }
}
