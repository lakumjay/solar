<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('companies', function (Blueprint $table) {
            $table->boolean('is_ss_reference')->default(false)->after('active');
        });

        $referenceId = DB::table('companies')
            ->where('active', true)
            ->orderByRaw('CASE WHEN LOWER(name) = ? THEN 0 ELSE 1 END', ['sunrise green energy'])
            ->orderBy('id')
            ->value('id');

        if ($referenceId) {
            DB::table('companies')->where('id', $referenceId)->update(['is_ss_reference' => true]);
        }
    }

    public function down(): void
    {
        Schema::table('companies', function (Blueprint $table) {
            $table->dropColumn('is_ss_reference');
        });
    }
};
