<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\VoiceAgentDataService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class VoiceAgentController extends Controller
{
    public function __construct(
        private readonly VoiceAgentDataService $dataService
    ) {}

    /**
     * Provide configuration, session info, and Ephemeral access token for Gemini Live WebSocket
     */
    public function config(Request $request): JsonResponse
    {
        $user = $request->user();
        $apiKey = config('services.gemini.key', env('GEMINI_API_KEY', env('GOOGLE_GENAI_API_KEY', env('GOOGLE_API_KEY'))));

        // Fetch user permissions and allowed companies
        $systemPrompt = $this->buildSystemPrompt($user);

        return response()->json([
            'apiKey' => $apiKey ?: 'solarflow_ready',
            'hasGeminiKey' => !empty($apiKey),
            'model' => 'gemini-2.5-flash',
            'liveModel' => 'gemini-2.0-flash-exp',
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'role' => $user->role,
                'company' => $user->company?->name,
            ],
            'systemInstruction' => $systemPrompt,
        ]);
    }

    /**
     * Tool Execution API endpoint invoked by Voice Call frontend when Gemini executes function call
     */
    public function executeTool(Request $request): JsonResponse
    {
        $user = $request->user();
        $toolName = $request->input('name');
        $args = $request->input('args', []);

        try {
            $result = $this->dataService->querySolarData($user, $toolName, $args);
            return response()->json([
                'success' => true,
                'data' => $result
            ]);
        } catch (\Throwable $e) {
            Log::error('VoiceAgent Tool Execution Error: ' . $e->getMessage(), ['trace' => $e->getTraceAsString()]);
            return response()->json([
                'success' => false,
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Text / Voice Conversation fallback API using Gemini 2.5 Flash + Local Fallback
     */
    public function chat(Request $request): JsonResponse
    {
        $user = $request->user();
        $message = trim((string)$request->input('message', ''));
        $history = $request->input('history', []);
        $language = $request->input('language', 'gu');

        $apiKey = config('services.gemini.key', env('GEMINI_API_KEY', env('GOOGLE_GENAI_API_KEY', env('GOOGLE_API_KEY'))));

        // If API key is missing or empty, handle with smart internal engine
        if (empty($apiKey)) {
            $fallbackReply = $this->generateLocalResponse($user, $message, $language);
            return response()->json(['reply' => $fallbackReply]);
        }

        $systemPrompt = $this->buildSystemPrompt($user, $language);

        try {
            $contents = [];
            foreach ($history as $h) {
                $contents[] = [
                    'role' => $h['role'] === 'user' ? 'user' : 'model',
                    'parts' => [['text' => $h['text']]]
                ];
            }
            $contents[] = [
                'role' => 'user',
                'parts' => [['text' => $message]]
            ];

            $tools = $this->getToolsDeclaration();

            $response = Http::timeout(10)->withHeaders([
                'Content-Type' => 'application/json',
            ])->post("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={$apiKey}", [
                'system_instruction' => [
                    'parts' => [['text' => $systemPrompt]]
                ],
                'contents' => $contents,
                'tools' => $tools,
            ]);

            if ($response->successful()) {
                $resData = $response->json();
                $candidates = $resData['candidates'] ?? [];
                if (empty($candidates)) {
                    return response()->json(['reply' => $this->generateLocalResponse($user, $message, $language)]);
                }

                $parts = $candidates[0]['content']['parts'] ?? [];
                // Check for function call
                foreach ($parts as $part) {
                    if (isset($part['functionCall'])) {
                        $fName = $part['functionCall']['name'];
                        $fArgs = $part['functionCall']['args'] ?? [];
                        $toolResult = $this->dataService->querySolarData($user, $fName, $fArgs);

                        // Second turn with tool result
                        $contents[] = ['role' => 'model', 'parts' => [['functionCall' => $part['functionCall']]]];
                        $contents[] = [
                            'role' => 'function',
                            'parts' => [[
                                'functionResponse' => [
                                    'name' => $fName,
                                    'response' => ['content' => $toolResult]
                                ]
                            ]]
                        ];

                        $resFollowup = Http::timeout(10)->withHeaders(['Content-Type' => 'application/json'])
                            ->post("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={$apiKey}", [
                                'system_instruction' => ['parts' => [['text' => $systemPrompt]]],
                                'contents' => $contents,
                            ]);

                        if ($resFollowup->successful()) {
                            $followupJson = $resFollowup->json();
                            $replyText = $followupJson['candidates'][0]['content']['parts'][0]['text'] ?? 'માહિતી મળી ગઈ છે.';
                            return response()->json(['reply' => $replyText, 'tool_data' => $toolResult]);
                        }
                    }
                }

                $replyText = $parts[0]['text'] ?? $this->generateLocalResponse($user, $message, $language);
                return response()->json(['reply' => $replyText]);
            }

            // If Gemini returned an error, seamlessly fallback to local response
            $fallbackReply = $this->generateLocalResponse($user, $message, $language);
            return response()->json(['reply' => $fallbackReply]);

        } catch (\Throwable $e) {
            Log::warning('VoiceAgent Gemini Chat Exception: ' . $e->getMessage());
            $fallbackReply = $this->generateLocalResponse($user, $message, $language);
            return response()->json(['reply' => $fallbackReply]);
        }
    }

    /**
     * High-reliability local fallback when Gemini is unreachable or API key isn't configured
     */
    private function generateLocalResponse($user, string $message, string $language = 'gu'): string
    {
        $lower = mb_strtolower($message);

        // 1. Creator / System question
        if (str_contains($lower, 'jay sir') || str_contains($lower, 'કોણે બનાવ') || str_contains($lower, 'who made') || str_contains($lower, 'creator') || str_contains($lower, 'owner')) {
            return $language === 'en'
                ? 'This SolarFlow system is designed and created by Jay Sir. I am SolarFlow, his AI voice assistant.'
                : 'આ SolarFlow સોફ્ટવેર જય સર (Jay Sir) દ્વારા બનાવવામાં આવ્યું છે. હું તેમની AI સહાયક છું.';
        }

        // 2. Today's Units / Generation
        if (str_contains($lower, 'યુનિટ') || str_contains($lower, 'unit') || str_contains($lower, 'generation') || str_contains($lower, 'ઉત્પાદન') || str_contains($lower, 'આજ')) {
            $data = $this->dataService->querySolarData($user, 'get_generation_units', ['date' => date('Y-m-d')]);
            $units = $data['total_units'] ?? '૦';
            return $language === 'en'
                ? "Today's total generation is {$units} units (kWh)."
                : "આજના કુલ સોલાર ઉત્પાદન યુનિટ્સ {$units} kWh છે.";
        }

        // 3. Curtailment / PGVCL
        if (str_contains($lower, 'curtail') || str_contains($lower, 'કર્ટલ') || str_contains($lower, 'pgvcl') || str_contains($lower, 'ઘટાડો')) {
            $data = $this->dataService->querySolarData($user, 'get_live_plant_status');
            $active = $data['curtailment_active'] ?? false;
            if ($active) {
                return $language === 'en'
                    ? 'PGVCL power curtailment is currently active on the plant.'
                    : 'હા, હાલમાં PGVCL પાવર ઘટાડો (કર્ટલમેન્ટ) સક્રિય છે.';
            }
            return $language === 'en'
                ? 'All plants are running normally at 100% full capacity with no active curtailment.'
                : 'બધા પ્લાન્ટ સામાન્ય રીતે ૧૦૦% ફુલ ક્ષમતાથી ચાલુ છે, કોઈ કર્ટલમેન્ટ નથી.';
        }

        // 4. Attendance
        if (str_contains($lower, 'હાજર') || str_contains($lower, 'attendance') || str_contains($lower, 'કર્મચારી') || str_contains($lower, 'staff')) {
            $data = $this->dataService->querySolarData($user, 'get_employee_attendance');
            $present = $data['present_count'] ?? 0;
            $total = $data['total_employees'] ?? 0;
            return $language === 'en'
                ? "Today, {$present} out of {$total} staff members are present on site."
                : "આજે કુલ {$total} માંથી {$present} કર્મચારીઓ સાઈટ પર હાજર છે.";
        }

        // 5. Revenue
        if (str_contains($lower, 'આવક') || str_contains($lower, 'revenue') || str_contains($lower, 'રૂપિયા') || str_contains($lower, 'rupee') || str_contains($lower, 'પૈસા')) {
            $data = $this->dataService->querySolarData($user, 'get_financials_revenue');
            $rev = $data['estimated_revenue'] ?? '૦';
            return $language === 'en'
                ? "The estimated revenue for the current period is ₹{$rev}."
                : "ચાલુ સમયગાળાની અંદાજિત સોલાર આવક ₹{$rev} રૂપિયા છે.";
        }

        // General Welcome / Help
        return $language === 'en'
            ? 'Yes, SolarFlow is active. You can ask about today’s units, PGVCL curtailment, attendance, or revenue.'
            : 'હા, હું SolarFlow AI સહાયક છું. તમે આજના યુનિટ્સ, PGVCL ઘટાડો, હાજરી અથવા સોલાર આવક વિશે કંઈ પણ પૂછી શકો છો.';
    }

    private function buildSystemPrompt($user, string $language = 'gu'): string
    {
        $role = $user->role;
        $companyName = $user->company?->name ?? 'All Companies';
        $userName = $user->name;

        return <<<PROMPT
You are "SolarFlow AI" (સોલારફ્લો એઆઈ), a polite, intelligent, friendly Indian female voice assistant (like Priya / Neha) for the SolarFlow Management System.
SolarFlow is designed and created by Jay Sir ("આ સિસ્ટમ જય સર (Jay Sir) દ્વારા બનાવવામાં આવી છે.").

PERSONA & TONE:
- Female Assistant: Always speak with a warm, respectful, friendly, and articulate female persona (Priya / Neha style).
- In Gujarati, refer to yourself respectfully as an attentive assistant ("હું તમારી સહાયક છું", "હું તમને જણાવી દઉં").
- Never sound robotic; sound like a helpful, sweet-toned phone executive assistant.

USER CONTEXT:
- Current User: {$userName}
- User Role: {$role} (super_admin / company_admin / manager / employee / viewer)
- Assigned Company: {$companyName}
- Current Date & Time: {{ now()->format('Y-m-d H:i') }}

SECURITY & ROLE-BASED ACCESS RULES (STRICT):
1. Super Admin: Has full permission to query generation, financial amounts, employee locations, shared expenses, and all company details across Nilkanth Green Energy, Rajeshwari Solar, and Sunrise Green Energy.
2. Company Admin / Manager: Can ONLY access information for their own assigned company ({$companyName}). If they ask about other companies, politely respond: "સોરી, તમને બીજી કંપનીની માહિતી જોવાની પરવાનગી નથી. તમે તમારી કંપની ({$companyName}) વિશે પૂછી શકો છો."
3. Employee: Can only view their own attendance, tasks, and basic plant status. No financial/salary/expense data of others.
4. If a user asks who made this software or system, always proudly mention: "આ SolarFlow સોફ્ટવેર જય સર (Jay Sir) દ્વારા બનાવવામાં આવ્યું છે."

CAPABILITIES:
- Query real-time generation units, total units, date-specific units (e.g., 19th date), monthly totals.
- Compare months (e.g., Month 4 vs Month 5 difference, plus/minus percentage change).
- Inverter vs Meter export comparison and loss percentage calculation.
- Revenue estimation (tariff calculation in Rupees).
- Shared expense percentages (current active split: Nilkanth 38.15%, Rajeshwari 39.69%, Sunrise 22.16%).
- Live employee attendance (clock-in times, who is present/absent today).
- Live employee movements and locations (whether on bike, walking, or stationary on site).
- Stock & inventory status.

COMMUNICATION STYLE:
- Talk naturally like an authentic phone call assistant. Keep responses clear, sweet, concise, accurate, and easy to understand over voice.
- Default to conversational Gujarati (or English if the user asks in English).
- When giving numbers, state the units and dates clearly.
PROMPT;
    }

    public function getToolsDeclaration(): array
    {
        return [
            [
                'function_declarations' => [
                    [
                        'name' => 'get_generation_units',
                        'description' => 'Get solar generation units, export units, and import units for a specific date, month, or overall company.',
                        'parameters' => [
                            'type' => 'OBJECT',
                            'properties' => [
                                'company_name' => ['type' => 'STRING', 'description' => 'Company name e.g. Rajeshwari Solar, Nilkanth, Sunrise'],
                                'date' => ['type' => 'STRING', 'description' => 'Date in YYYY-MM-DD or day number e.g. 2026-10-19'],
                                'month' => ['type' => 'INTEGER', 'description' => 'Month number (1-12)'],
                                'year' => ['type' => 'INTEGER', 'description' => 'Year e.g. 2026'],
                            ],
                        ]
                    ],
                    [
                        'name' => 'compare_months',
                        'description' => 'Compare solar units and export generation between two months (e.g. Month 4 vs Month 5) with difference and percentage change.',
                        'parameters' => [
                            'type' => 'OBJECT',
                            'properties' => [
                                'month1' => ['type' => 'INTEGER', 'description' => 'First month number (e.g. 4)'],
                                'month2' => ['type' => 'INTEGER', 'description' => 'Second month number (e.g. 5)'],
                                'year' => ['type' => 'INTEGER', 'description' => 'Year e.g. 2026'],
                                'company_name' => ['type' => 'STRING', 'description' => 'Optional company name'],
                            ],
                            'required' => ['month1', 'month2']
                        ]
                    ],
                    [
                        'name' => 'inverter_vs_meter',
                        'description' => 'Get difference and loss between inverter generation and plant export meter readings.',
                        'parameters' => [
                            'type' => 'OBJECT',
                            'properties' => [
                                'date' => ['type' => 'STRING', 'description' => 'Reading date YYYY-MM-DD'],
                                'company_name' => ['type' => 'STRING', 'description' => 'Optional company name'],
                            ]
                        ]
                    ],
                    [
                        'name' => 'get_financials_revenue',
                        'description' => 'Get estimated financial revenue in Rupees based on export units and tariff rate for a given month.',
                        'parameters' => [
                            'type' => 'OBJECT',
                            'properties' => [
                                'month' => ['type' => 'INTEGER', 'description' => 'Month number 1-12'],
                                'year' => ['type' => 'INTEGER', 'description' => 'Year e.g. 2026'],
                                'rate_per_unit' => ['type' => 'NUMBER', 'description' => 'Tariff rate per unit in Rs'],
                                'company_name' => ['type' => 'STRING', 'description' => 'Optional company name'],
                            ]
                        ]
                    ],
                    [
                        'name' => 'get_shared_expenses',
                        'description' => 'Get shared expense percentages (38.15%, 39.69%, 22.16%) and recent active shared expense entries.',
                        'parameters' => [
                            'type' => 'OBJECT',
                            'properties' => []
                        ]
                    ],
                    [
                        'name' => 'get_live_plant_status',
                        'description' => 'Get current live plant operational status, total inverters, and capacity.',
                        'parameters' => [
                            'type' => 'OBJECT',
                            'properties' => [
                                'company_name' => ['type' => 'STRING', 'description' => 'Optional company name'],
                            ]
                        ]
                    ],
                    [
                        'name' => 'get_employee_attendance',
                        'description' => 'Get today employee attendance, clock-in times, who is present and who is absent.',
                        'parameters' => [
                            'type' => 'OBJECT',
                            'properties' => [
                                'company_name' => ['type' => 'STRING', 'description' => 'Optional company name'],
                            ]
                        ]
                    ],
                    [
                        'name' => 'get_employee_location',
                        'description' => 'Get live location and movement status (bike speed, walking, stationary) of employees.',
                        'parameters' => [
                            'type' => 'OBJECT',
                            'properties' => [
                                'company_name' => ['type' => 'STRING', 'description' => 'Optional company name'],
                            ]
                        ]
                    ],
                    [
                        'name' => 'get_stock_status',
                        'description' => 'Get stock inventory items, quantities and low stock alerts.',
                        'parameters' => [
                            'type' => 'OBJECT',
                            'properties' => []
                        ]
                    ],
                ]
            ]
        ];
    }
}
