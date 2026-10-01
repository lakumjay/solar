<?php

namespace App\Services;

use App\Models\ActivityLog;
use App\Models\User;

class ActivityLogger
{
    public function log(User $actor, ?int $companyId, string $action, string $type, ?int $subjectId, string $description, array $changes = []): ActivityLog
    {
        return ActivityLog::create([
            'user_id' => $actor->id,
            'company_id' => $companyId,
            'action' => $action,
            'subject_type' => $type,
            'subject_id' => $subjectId,
            'description' => $description,
            'changes' => $changes,
        ]);
    }
}
