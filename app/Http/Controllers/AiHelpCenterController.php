<?php

namespace App\Http\Controllers;

use App\Services\SystemAutoDoctorService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

class AiHelpCenterController extends Controller
{
    public function __construct(
        private readonly SystemAutoDoctorService $doctor
    ) {}

    private function requireSuperAdmin(Request $request): void
    {
        abort_unless($request->user()?->role === 'super_admin', 403, 'Only Super Admin can access AI Help Center.');
    }

    /**
     * GET /api/ai-help-center/status
     */
    public function status(Request $request): JsonResponse
    {
        $this->requireSuperAdmin($request);

        $schemaFixes = $this->doctor->ensureAllSchemasExist();
        $gitStatus = $this->doctor->getGitAndSystemStatus();

        $tickets = [];
        if (Schema::hasTable('ai_help_tickets')) {
            $tickets = DB::table('ai_help_tickets')
                ->orderByDesc('id')
                ->limit(25)
                ->get()
                ->map(function ($row) {
                    $row->screenshots = json_decode((string) ($row->screenshots ?? '[]'), true) ?: [];
                    $row->modified_files = json_decode((string) ($row->modified_files ?? '[]'), true) ?: [];
                    return $row;
                });
        }

        return response()->json([
            'success' => true,
            'git' => $gitStatus,
            'schema_auto_fixes' => $schemaFixes,
            'tickets' => $tickets,
            'server_time' => now()->format('d M Y, h:i:s A'),
        ]);
    }

    /**
     * POST /api/ai-help-center/heal
     * Run pre-error database schema healer, migrations, and cache clear
     */
    public function heal(Request $request): JsonResponse
    {
        $this->requireSuperAdmin($request);

        $result = $this->doctor->healDatabaseAndSystem(true);
        $fixesText = ! empty($result['fixes'])
            ? implode("\n• ", $result['fixes'])
            : 'બધા ટેબલ, કોલમ અને કેશ પહેલેથી જ ૧૦૦% અપ-ટૂ-ડેટ છે.';

        $reply = "✅ **સિસ્ટમ અને ડેટાબેઝ ઓટો-હીલ (Auto-Heal) પૂર્ણ થયું!**\n\n• {$fixesText}\n• `php artisan migrate --force` અને `optimize:clear` સફળતાપૂર્વક રન થઈ ગયા છે.";

        if (Schema::hasTable('ai_help_tickets')) {
            DB::table('ai_help_tickets')->insert([
                'user_id' => $request->user()?->id,
                'source' => 'auto_doctor',
                'mode' => 'auto_heal',
                'prompt' => 'Run Database & System Auto-Doctor Heal',
                'screenshots' => json_encode([]),
                'ai_reply' => $reply,
                'modified_files' => json_encode($result['fixes']),
                'commit_hash' => null,
                'status' => 'auto_fixed',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        return response()->json([
            'success' => true,
            'message' => $reply,
            'details' => $result,
        ]);
    }

    /**
     * POST /api/ai-help-center/git-sync
     * Pull latest code from GitHub origin/main to cPanel & run migrate + optimize:clear
     */
    public function gitSync(Request $request): JsonResponse
    {
        $this->requireSuperAdmin($request);

        $sync = $this->doctor->syncAndDeployFromGit();
        $reply = "🚀 **GitHub માંથી લેટેસ્ટ કોડ તમારા cPanel સર્વર પર ઓટો-ડિપ્લોય થઈ ગયો છે!**\n\n• **Active Commit:** `{$sync['commit']}`\n• **Database Migrations & Cache:** Cleared & Updated.";

        if (Schema::hasTable('ai_help_tickets')) {
            DB::table('ai_help_tickets')->insert([
                'user_id' => $request->user()?->id,
                'source' => 'super_admin',
                'mode' => 'git_sync',
                'prompt' => 'Auto-Pull & Deploy Latest GitHub Code to cPanel',
                'screenshots' => json_encode([]),
                'ai_reply' => $reply,
                'modified_files' => json_encode([]),
                'commit_hash' => $sync['commit'],
                'status' => 'deployed',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        return response()->json([
            'success' => true,
            'message' => $reply,
            'sync' => $sync,
        ]);
    }

    /**
     * POST /api/ai-help-center/rollback
     * Revert the last commit and redeploy
     */
    public function rollback(Request $request): JsonResponse
    {
        $this->requireSuperAdmin($request);

        $basePath = base_path();
        $token = $this->doctor->getGithubToken();

        if (! empty($token)) {
            $authUrl = "https://x-access-token:{$token}@github.com/lakumjay/solar.git";
            @shell_exec("cd ".escapeshellarg($basePath)." && git remote set-url origin ".escapeshellarg($authUrl)." 2>&1");
        }

        $out = trim((string) @shell_exec("cd ".escapeshellarg($basePath)." && git revert --no-edit HEAD 2>&1 && git push origin main 2>&1"));
        @shell_exec("cd ".escapeshellarg($basePath)." && git remote set-url origin https://github.com/lakumjay/solar.git 2>&1");

        $this->doctor->healDatabaseAndSystem(true);
        $newCommit = trim((string) @shell_exec("cd ".escapeshellarg($basePath)." && git rev-parse --short HEAD 2>/dev/null"));

        $reply = "⏪ **છેલ્લો ફેરફાર પાછો ખેંચી લેવામાં આવ્યો છે (Rollback Completed)!**\n\n• **New Active Commit:** `{$newCommit}`";

        return response()->json([
            'success' => true,
            'message' => $reply,
            'commit' => $newCommit,
            'output' => $out,
        ]);
    }

    /**
     * POST /api/ai-help-center/chat
     * Super Admin Multi-Screenshot + Gujarati AI Diagnose & Auto-Code / Git Push / cPanel Deploy
     */
    public function chat(Request $request): JsonResponse
    {
        $this->requireSuperAdmin($request);
        $this->doctor->ensureAllSchemasExist();

        $prompt = trim((string) $request->input('prompt', ''));
        $mode = trim((string) $request->input('mode', 'diagnose')); // 'diagnose' or 'auto_code'
        $files = $request->file('screenshots', []);
        if (! is_array($files)) {
            $files = $files ? [$files] : [];
        }

        if ($prompt === '' && empty($files)) {
            return response()->json([
                'success' => false,
                'message' => 'કૃપા કરીને તમારો પ્રશ્ન લખો અથવા એરરનો સ્ક્રીનશોટ અપલોડ કરો.',
            ], 422);
        }

        // First run quick DB schema check so any missing column is healed immediately
        $autoFixes = $this->doctor->ensureAllSchemasExist();

        // Save uploaded screenshots and prepare base64 parts for Gemini Vision
        $savedScreenshots = [];
        $imageParts = [];
        foreach ($files as $file) {
            if (! $file || ! $file->isValid()) {
                continue;
            }
            $path = $file->store('ai-help-screenshots/'.now()->format('Y/m'), 'public');
            $savedScreenshots[] = '/storage/'.$path;

            $mime = $file->getMimeType() ?: 'image/png';
            $b64 = base64_encode((string) file_get_contents($file->getRealPath()));
            $imageParts[] = [
                'inline_data' => [
                    'mime_type' => $mime,
                    'data' => $b64,
                ],
            ];
        }

        // Gather relevant codebase context automatically based on the user's prompt
        $codeContext = $this->gatherRelevantCodeContext($prompt);

        $apiKey = config('services.gemini.key', env('GEMINI_API_KEY', env('GOOGLE_GENAI_API_KEY', env('GOOGLE_API_KEY'))));
        if (empty($apiKey)) {
            return response()->json([
                'success' => false,
                'message' => 'GEMINI_API_KEY સેટ નથી. કૃપા કરીને .env માં GEMINI_API_KEY ચેક કરો.',
            ], 500);
        }

        if ($mode === 'auto_code') {
            $systemInstruction = <<<'SYS'
You are Antigravity AI Auto-Developer embedded inside the SolarFlow Production Application for the Super Admin.
Your job is to inspect the user's prompt, uploaded error/UI screenshots, and the provided codebase files, then:
1. Write a clear, friendly explanation in **Gujarati** (`reply_gujarati`) explaining what the issue was and what code changes you made.
2. Provide the exact, minimal file edits (`edits`) needed to fix the issue or implement the requested change.
3. Return ONLY valid JSON matching this exact structure (no markdown code fences around the JSON):
{
  "reply_gujarati": "ગુજરાતીમાં સંપૂર્ણ જવાબ અને શું સુધારો કર્યો તેની વિગત...",
  "commit_message": "fix(ui): brief commit message",
  "edits": [
    {
      "file": "relative/path/from/repo/root",
      "search": "EXACT existing lines from the file to replace",
      "replace": "New replacement lines"
    }
  ]
}
Rules for `edits`:
- `search` MUST be an exact substring from the provided file content.
- Keep edits surgical and safe. Preserve all existing imports and unrelated code.
- If no file edit is needed (e.g., it was a database schema issue or a question), return `"edits": []`.
SYS;
        } else {
            $systemInstruction = <<<'SYS'
You are Antigravity AI Senior Architect & Debugger embedded inside the SolarFlow Production Application for the Super Admin.
The Super Admin has selected **"Diagnose & Explain Only (Code Mat Karna)"** mode.
Analyze the user's prompt, any uploaded screenshots, and the provided codebase context.
Respond clearly in **Gujarati** (using clean Markdown bullets and bold headings):
1. **🔍 સમસ્યાનું સાચું કારણ (Root Cause):** સ્ક્રીનશોટ કે પ્રશ્ન મુજબ કઈ ફાઇલમાં અને કઈ લાઈનમાં શું સમસ્યા છે.
2. **🛠️ આપણે કેવી રીતે સોલ્વ કરીશું (Solution Plan):** તેને કેવી રીતે ફિક્સ કરીશું તેનો સ્ટેપ-બાય-સ્ટેપ ફ્લો.
Do NOT modify code in this mode — tell the Super Admin at the end that they can click **"⚡ Auto-Code, Git Push & Deploy"** to apply this fix automatically!
SYS;
        }

        $userParts = $imageParts;
        $userParts[] = [
            'text' => "Super Admin Request: ".($prompt ?: 'Please analyze the uploaded screenshot(s) and explain/fix the issue.')."\n\n".
                (! empty($autoFixes) ? "Note: Pre-Error Auto-Doctor already healed these DB schemas automatically: ".implode(', ', $autoFixes)."\n\n" : '').
                "Relevant Codebase Files:\n".$codeContext,
        ];

        try {
            $payload = [
                'system_instruction' => [
                    'parts' => [['text' => $systemInstruction]],
                ],
                'contents' => [
                    [
                        'role' => 'user',
                        'parts' => $userParts,
                    ],
                ],
                'generationConfig' => [
                    'temperature' => 0.2,
                ],
            ];

            if ($mode === 'auto_code') {
                $payload['generationConfig']['responseMimeType'] = 'application/json';
            }

            $modelsToTry = ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite', 'gemini-3.8-flash'];
            $response = null;
            foreach ($modelsToTry as $modelName) {
                try {
                    $response = Http::withOptions([
                        'curl' => [CURLOPT_IPRESOLVE => CURL_IPRESOLVE_V4],
                    ])->timeout(60)->withHeaders([
                        'Content-Type' => 'application/json',
                    ])->post("https://generativelanguage.googleapis.com/v1beta/models/{$modelName}:generateContent?key={$apiKey}", $payload);

                    if ($response->successful()) {
                        break;
                    }
                } catch (\Throwable $err) {
                    // Try next model
                }
            }

            if (! $response || ! $response->successful()) {
                $errBody = $response ? preg_replace('/key=[a-zA-Z0-9_\-]+/i', 'key=***', $response->body()) : 'Timeout connecting to AI server';
                return response()->json([
                    'success' => false,
                    'message' => 'AI Engine Error: '.$errBody,
                ], 500);
            }

            // Extract non-thought text parts (Gemini 3.8 Flash includes a thought part first)
            $resParts = $response->json('candidates.0.content.parts') ?? [];
            $textChunks = [];
            foreach ($resParts as $part) {
                if (empty($part['thought']) && isset($part['text'])) {
                    $textChunks[] = $part['text'];
                }
            }
            if (empty($textChunks) && ! empty($resParts)) {
                $lastPart = end($resParts);
                $textChunks[] = $lastPart['text'] ?? '';
            }
            $rawText = trim(implode("\n", $textChunks));
            $modifiedFiles = [];
            $commitHash = null;
            $cloudBuildTriggered = false;
            $replyGujarati = $rawText;
            $status = 'completed';

            if ($mode === 'auto_code') {
                // Parse JSON response
                $cleanedJson = preg_replace('/^```json\s*|\s*```$/i', '', $rawText);
                $parsed = json_decode((string) $cleanedJson, true);

                if (is_array($parsed)) {
                    $replyGujarati = (string) ($parsed['reply_gujarati'] ?? 'કોડ અપડેટ પૂર્ણ થયું.');
                    $commitMsg = (string) ($parsed['commit_message'] ?? 'ai(auto-code): auto fix from Super Admin AI Help Center');
                    $edits = is_array($parsed['edits'] ?? null) ? $parsed['edits'] : [];

                    $needsFrontendBuild = false;
                    foreach ($edits as $edit) {
                        $relFile = ltrim((string) ($edit['file'] ?? ''), '/');
                        $search = (string) ($edit['search'] ?? '');
                        $replace = (string) ($edit['replace'] ?? '');

                        if (! $relFile || $search === '') {
                            continue;
                        }

                        // Security check: only allow editing inside app/, resources/, routes/, database/
                        if (! preg_match('#^(app|resources|routes|database)/#', $relFile)) {
                            continue;
                        }

                        $fullPath = base_path($relFile);
                        if (! is_file($fullPath)) {
                            continue;
                        }

                        $originalContent = (string) file_get_contents($fullPath);
                        if (! str_contains($originalContent, $search)) {
                            continue;
                        }

                        $newContent = str_replace($search, $replace, $originalContent);
                        file_put_contents($fullPath, $newContent);

                        // If PHP file, verify syntax with php -l before keeping
                        if (str_ends_with($relFile, '.php')) {
                            $lintOut = (string) @shell_exec('php -l '.escapeshellarg($fullPath).' 2>&1');
                            if (! str_contains($lintOut, 'No syntax errors detected')) {
                                // Restore original file immediately so site never breaks
                                file_put_contents($fullPath, $originalContent);
                                continue;
                            }
                        }

                        if (str_starts_with($relFile, 'resources/js/') || str_starts_with($relFile, 'resources/css/')) {
                            $needsFrontendBuild = true;
                        }

                        $modifiedFiles[] = $relFile;
                    }

                    if (! empty($modifiedFiles)) {
                        $pushResult = $this->doctor->pushFilesToGithub($modifiedFiles, $commitMsg, $needsFrontendBuild);
                        $commitHash = $pushResult['commit_hash'] ?? null;
                        $cloudBuildTriggered = (bool) ($pushResult['cloud_build_triggered'] ?? false);
                        $this->doctor->healDatabaseAndSystem(true);
                        $status = 'deployed';

                        $replyGujarati .= "\n\n---\n### 🚀 ઓટો-ડિપ્લોય રિપોર્ટ (Auto-Deploy Summary):\n".
                            "• **સુધારેલી ફાઇલો:** `".implode('`, `', $modifiedFiles)."`\n".
                            "• **Git Commit:** `{$commitHash}` (Pushed to `lakumjay/solar`)\n".
                            ($cloudBuildTriggered
                                ? "• **Cloud Build (GitHub Actions):** ચાલુ થઈ ગયું છે (તમારા PC વગર ક્લાઉડમાં `npm run build` થઈને ૧ મિનિટમાં cPanel પર ઓટો-અપડેટ થઈ જશે!)"
                                : "• **Live Server Update:** cPanel પર તરત જ લાઈવ થઈ ગયું છે!");
                    }
                }
            }

            // Record ticket in DB
            $ticketId = null;
            if (Schema::hasTable('ai_help_tickets')) {
                $ticketId = DB::table('ai_help_tickets')->insertGetId([
                    'user_id' => $request->user()?->id,
                    'source' => 'super_admin',
                    'mode' => $mode,
                    'prompt' => $prompt,
                    'screenshots' => json_encode($savedScreenshots),
                    'ai_reply' => $replyGujarati,
                    'modified_files' => json_encode($modifiedFiles),
                    'commit_hash' => $commitHash,
                    'status' => $status,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }

            return response()->json([
                'success' => true,
                'ticket_id' => $ticketId,
                'mode' => $mode,
                'reply' => $replyGujarati,
                'modified_files' => $modifiedFiles,
                'commit_hash' => $commitHash,
                'cloud_build_triggered' => $cloudBuildTriggered,
                'screenshots' => $savedScreenshots,
            ]);
        } catch (\Throwable $e) {
            Log::error('AI Help Center error: '.$e->getMessage());
            $cleanMsg = preg_replace('/key=[a-zA-Z0-9_\-]+/i', 'key=***', $e->getMessage());
            return response()->json([
                'success' => false,
                'message' => 'AI Help Center સમસ્યા: '.$cleanMsg,
            ], 500);
        }
    }

    /**
     * POST /api/ai-help-center/auto-report
     * Captures frontend/backend errors automatically & triggers database self-heal
     */
    public function autoReportError(Request $request): JsonResponse
    {
        try {
            $fixes = $this->doctor->ensureAllSchemasExist();
            $errorMessage = trim((string) $request->input('message', ''));
            $component = trim((string) $request->input('component', 'frontend'));

            if ($errorMessage !== '' && Schema::hasTable('ai_help_tickets')) {
                // Avoid duplicate spam within 10 minutes
                $recentExists = DB::table('ai_help_tickets')
                    ->where('source', 'frontend_error')
                    ->where('prompt', $errorMessage)
                    ->where('created_at', '>=', now()->subMinutes(10))
                    ->exists();

                if (! $recentExists) {
                    DB::table('ai_help_tickets')->insert([
                        'user_id' => $request->user()?->id,
                        'source' => 'frontend_error',
                        'mode' => 'auto_heal',
                        'prompt' => "[Auto-Captured Error in {$component}]: {$errorMessage}",
                        'screenshots' => json_encode([]),
                        'ai_reply' => ! empty($fixes)
                            ? 'ઓટો-ડોક્ટરે ખૂટતા ડેટાબેઝ કોલમ સુધારી દીધા છે: '.implode(', ', $fixes)
                            : 'એરર લોગ થઈ ગઈ છે અને ડેટાબેઝ સ્કીમા ચેક થઈ ગયું છે.',
                        'modified_files' => json_encode($fixes),
                        'commit_hash' => null,
                        'status' => ! empty($fixes) ? 'auto_fixed' : 'logged',
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }
            }

            return response()->json([
                'success' => true,
                'auto_fixes' => $fixes,
            ]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false]);
        }
    }

    /**
     * POST /api/ai-help-center/webhook-deploy
     * Public webhook endpoint called automatically by GitHub & GitHub Actions on push/build completion
     */
    public function webhookDeploy(Request $request): JsonResponse
    {
        $secret = (string) $request->query('secret', '');
        $sigHeader = (string) $request->header('X-Hub-Signature-256', '');
        $valid = false;

        if ($secret === 'solarflow_auto_deploy_2026') {
            $valid = true;
        } elseif ($sigHeader !== '') {
            $expected = 'sha256='.hash_hmac('sha256', $request->getContent(), 'solarflow_auto_deploy_2026');
            if (hash_equals($expected, $sigHeader)) {
                $valid = true;
            }
        }

        if (! $valid) {
            return response()->json(['message' => 'Invalid webhook signature'], 403);
        }

        // Ignore push webhook if commit has [cloud-build] (wait for GitHub Actions to finish compiling public/build first!)
        $headCommitMsg = (string) $request->input('head_commit.message', '');
        if (str_contains($headCommitMsg, '[cloud-build]')) {
            return response()->json([
                'success' => true,
                'status' => 'waiting_for_cloud_build',
                'message' => 'Cloud build is compiling public/build; cPanel will auto-pull once build commit arrives.',
            ]);
        }

        $sync = $this->doctor->syncAndDeployFromGit();

        return response()->json([
            'success' => true,
            'status' => 'deployed_to_cpanel',
            'sync' => $sync,
        ]);
    }

    /**
     * Automatically pick relevant files to include in AI context based on prompt keywords
     */
    private function gatherRelevantCodeContext(string $prompt): string
    {
        $lower = mb_strtolower($prompt);
        $files = [];

        if (str_contains($lower, 'attendance') || str_contains($lower, 'break') || str_contains($lower, 'time out') || str_contains($lower, 'time in') || str_contains($lower, 'હાજરી') || str_contains($lower, 'બ્રેક') || str_contains($lower, 'recent')) {
            $files[] = 'resources/js/solar/pages/MyAttendancePage.jsx';
            $files[] = 'app/Services/AttendanceService.php';
        }
        if (str_contains($lower, 'entry') || str_contains($lower, 'daily') || str_contains($lower, 'nilkanth') || str_contains($lower, 'company') || str_contains($lower, 'કંપની')) {
            $files[] = 'resources/js/solar/pages/DailyEntryPage.jsx';
            $files[] = 'resources/js/solar/components/AppShell.jsx';
        }
        if (str_contains($lower, 'solar') || str_contains($lower, 'inverter') || str_contains($lower, 'forecast') || str_contains($lower, 'heat') || str_contains($lower, 'string') || str_contains($lower, 'ઇન્વર્ટર')) {
            $files[] = 'app/Http/Controllers/ISolarCloudController.php';
            $files[] = 'resources/js/solar/pages/DashboardPage.jsx';
        }
        if (str_contains($lower, 'mobile') || str_contains($lower, 'more') || str_contains($lower, 'મોબાઈલ')) {
            $files[] = 'resources/js/solar/components/MobileAppView.jsx';
        }
        if (str_contains($lower, 'salary') || str_contains($lower, 'પગાર')) {
            $files[] = 'resources/js/solar/pages/SalaryPage.jsx';
            $files[] = 'resources/js/solar/pages/MySalaryPage.jsx';
        }

        if (empty($files)) {
            $files = [
                'resources/js/solar/components/AppShell.jsx',
                'resources/js/solar/pages/MyAttendancePage.jsx',
                'resources/js/solar/pages/DailyEntryPage.jsx',
            ];
        }

        $contextOut = '';
        foreach (array_slice(array_unique($files), 0, 3) as $relPath) {
            $full = base_path($relPath);
            if (is_file($full)) {
                $content = (string) file_get_contents($full);
                if (strlen($content) > 18000) {
                    $content = substr($content, 0, 18000)."\n... [truncated]";
                }
                $contextOut .= "\n=== FILE: {$relPath} ===\n{$content}\n";
            }
        }

        return $contextOut;
    }
}
