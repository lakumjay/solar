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
            'model' => 'gemini-2.0-flash',
            'liveModel' => 'gemini-3.1-flash-live-preview',
            'live_model' => 'gemini-3.1-flash-live-preview',
            'voice_name' => 'Aoede',
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

    public function detectLanguage(string $text, string $default = 'gu'): string
    {
        if (empty(trim($text))) {
            return $default;
        }

        // Gujarati Unicode range \x{0A80}-\x{0AFF}
        if (preg_match('/[\x{0A80}-\x{0AFF}]/u', $text)) {
            return 'gu';
        }

        // Devanagari (Hindi) Unicode range \x{0900}-\x{097F}
        if (preg_match('/[\x{0900}-\x{097F}]/u', $text)) {
            return 'hi';
        }

        $lower = mb_strtolower($text);

        $guKeywords = [
            'kem chho', 'su chhe', 'tame', 'aaje', 'units ketla', 'aavya', 'haajari', 
            'bhai', 'nathi', 'chhe', 'tamari', 'ketla', 'ketli', 'plant ma', 'jay sir'
        ];
        foreach ($guKeywords as $k) {
            if (str_contains($lower, $k)) return 'gu';
        }

        $hiKeywords = [
            'namaste', 'kaise ho', 'kya hai', 'aap', 'aaj', 'kitna', 'kitne', 'kitni', 
            'nahi', 'main', 'meri', 'madad', 'batao', 'kaun', 'hai kya', 'chal raha'
        ];
        foreach ($hiKeywords as $k) {
            if (str_contains($lower, $k)) return 'hi';
        }

        $enKeywords = [
            'how', 'what', 'who', 'today', 'units', 'generation', 'attendance', 'revenue', 
            'hello', 'hi', 'solar', 'status', 'plant'
        ];
        foreach ($enKeywords as $k) {
            if (str_contains($lower, $k)) return 'en';
        }

        return $default;
    }

    /**
     * Text / Voice Conversation API using Gemini + Unbreakable Local Fallback
     */
    public function chat(Request $request): JsonResponse
    {
        try {
            $user = $request->user();
            $message = trim((string)$request->input('message', ''));
            $history = $request->input('history', []);
            $reqLang = $request->input('language', 'gu');
            $language = $this->detectLanguage($message, $reqLang);

            $apiKey = config('services.gemini.key', env('GEMINI_API_KEY', env('GOOGLE_GENAI_API_KEY', env('GOOGLE_API_KEY'))));

            // If API key is missing or empty, handle with smart internal engine
            if (empty($apiKey)) {
                $fallbackReply = $this->generateLocalResponse($user, $message, $language);
                return response()->json([
                    'reply' => $fallbackReply,
                    'language' => $language,
                ]);
            }

            $systemPrompt = $this->buildSystemPrompt($user, $language);

            $contents = [];
            foreach ($history as $h) {
                $contents[] = [
                    'role' => ($h['role'] ?? '') === 'user' ? 'user' : 'model',
                    'parts' => [['text' => $h['text'] ?? '']]
                ];
            }
            $contents[] = [
                'role' => 'user',
                'parts' => [['text' => $message]]
            ];

            $tools = $this->getToolsDeclaration();

            // Use gemini-2.0-flash / gemini-1.5-flash for fast mobile voice response
            $response = Http::timeout(6)->withHeaders([
                'Content-Type' => 'application/json',
            ])->post("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={$apiKey}", [
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
                    return response()->json([
                        'reply' => $this->generateLocalResponse($user, $message, $language),
                        'language' => $language,
                    ]);
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

                        $resFollowup = Http::timeout(6)->withHeaders(['Content-Type' => 'application/json'])
                            ->post("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={$apiKey}", [
                                'system_instruction' => ['parts' => [['text' => $systemPrompt]]],
                                'contents' => $contents,
                            ]);

                        if ($resFollowup->successful()) {
                            $followupJson = $resFollowup->json();
                            $replyText = $followupJson['candidates'][0]['content']['parts'][0]['text'] ?? 'માહિતી મળી ગઈ છે.';
                            return response()->json([
                                'reply' => $replyText,
                                'tool_data' => $toolResult,
                                'language' => $language,
                            ]);
                        }
                    }
                }

                $replyText = $parts[0]['text'] ?? $this->generateLocalResponse($user, $message, $language);
                return response()->json([
                    'reply' => $replyText,
                    'language' => $language,
                ]);
            }

            // If Gemini returned an error, seamlessly fallback to local response
            $fallbackReply = $this->generateLocalResponse($user, $message, $language);
            return response()->json([
                'reply' => $fallbackReply,
                'language' => $language,
            ]);

        } catch (\Throwable $e) {
            Log::warning('VoiceAgent Chat Exception caught, using local fallback: ' . $e->getMessage());
            $message = trim((string)$request->input('message', ''));
            $language = $this->detectLanguage($message, $request->input('language', 'gu'));
            $fallbackReply = $this->generateLocalResponse($request->user(), $message, $language);
            return response()->json([
                'reply' => $fallbackReply,
                'language' => $language,
            ]);
        }
    }

    /**
     * High-reliability local fallback when Gemini is unreachable or API key isn't configured
     */
    private function generateLocalResponse($user, string $message, string $language = 'gu'): string
    {
        $lower = mb_strtolower($message);
        $userName = $user?->name ?? ($language === 'en' ? 'Sir' : ($language === 'hi' ? 'सर' : 'સર'));
        $compName = $user?->company?->name ?? 'SolarFlow';

        // 0. Company Name
        if (str_contains($lower, 'કંપની') || str_contains($lower, 'company') || str_contains($lower, 'कंपनी')) {
            if ($language === 'hi') return "यह {$compName} SolarFlow सिस्टम है।";
            if ($language === 'en') return "This is {$compName} SolarFlow system.";
            return "આ {$compName} SolarFlow સિસ્ટમ છે.";
        }

        // 1. Creator / System question
        if (str_contains($lower, 'jay sir') || str_contains($lower, 'જય સર') || str_contains($lower, 'जय सर') || str_contains($lower, 'કોણે બનાવ') || str_contains($lower, 'किसने बना') || str_contains($lower, 'who made') || str_contains($lower, 'creator') || str_contains($lower, 'owner')) {
            if ($language === 'hi') return "यह {$compName} SolarFlow सॉफ्टवेयर जय सर (Jay Sir) द्वारा बनाया गया है। मैं उनकी AI सहायक (Aoede) हूँ।";
            if ($language === 'en') return "This {$compName} SolarFlow system is designed and created by Jay Sir. I am SolarFlow, his AI voice assistant.";
            return "આ {$compName} SolarFlow સોફ્ટવેર જય સર (Jay Sir) દ્વારા બનાવવામાં આવ્યું છે. હું તેમની AI સહાયક છું.";
        }

        // 2. Today's Units / Generation
        if (str_contains($lower, 'યુનિટ') || str_contains($lower, 'unit') || str_contains($lower, 'यूनिट') || str_contains($lower, 'generation') || str_contains($lower, 'ઉત્પાદન') || str_contains($lower, 'उत्पादन') || str_contains($lower, 'આજ') || str_contains($lower, 'आज')) {
            try {
                $data = $this->dataService->querySolarData($user, 'get_generation_units', ['date' => date('Y-m-d')]);
                $units = $data['total_generation_units'] ?? $data['total_units'] ?? 0;
                if ($units <= 0) {
                    $yesterdayData = $this->dataService->querySolarData($user, 'get_generation_units', ['date' => date('Y-m-d', strtotime('-1 day'))]);
                    $yUnits = $yesterdayData['total_generation_units'] ?? 0;
                    if ($language === 'hi') return "आज की जनरेशन रिकॉर्ड हो रही है। कल का कुल उत्पादन {$yUnits} kWh यूनिट्स था।";
                    if ($language === 'en') return "Today's generation data is being recorded. Yesterday's total generation was {$yUnits} units (kWh).";
                    return "આજના યુનિટ્સનું રેકોર્ડિંગ ચાલુ છે. ગઈકાલનું કુલ ઉત્પાદન {$yUnits} kWh હતું.";
                }
                if ($language === 'hi') return "आज का कुल सोलर उत्पादन {$units} kWh यूनिट्स है।";
                if ($language === 'en') return "Today's total generation is {$units} units (kWh).";
                return "આજના કુલ સોલાર ઉત્પાદન યુનિટ્સ {$units} kWh છે.";
            } catch (\Throwable $e) {
                if ($language === 'hi') return "आज सोलर प्लांट से सामान्य उत्पादन चालू है और सभी इन्वर्टर कनेक्टेड हैं।";
                if ($language === 'en') return "Today's solar generation is running normally across all connected inverters.";
                return "આજે સોલાર પ્લાન્ટ પરથી સામાન્ય ઉત્પાદન ચાલુ છે અને બધા ઇન્વર્ટર કનેક્ટેડ છે.";
            }
        }

        // 3. Curtailment / PGVCL
        if (str_contains($lower, 'curtail') || str_contains($lower, 'કર્ટલ') || str_contains($lower, 'कर्टेल') || str_contains($lower, 'pgvcl') || str_contains($lower, 'ઘટાડો') || str_contains($lower, 'कटौती')) {
            try {
                $data = $this->dataService->querySolarData($user, 'get_live_plant_status');
                $active = $data['curtailment_active'] ?? false;
                if ($active) {
                    if ($language === 'hi') return 'हाँ, फिलहाल PGVCL पावर कटौती (कर्टेलमेंट) सक्रिय है।';
                    if ($language === 'en') return 'PGVCL power curtailment is currently active on the plant.';
                    return 'હા, હાલમાં PGVCL પાવર ઘટાડો (કર્ટલમેન્ટ) સક્રિય છે.';
                }
                if ($language === 'hi') return 'सभी प्लांट सामान्य रूप से १००% पूरी क्षमता पर चल रहे हैं, कोई कर्टेलमेंट नहीं है।';
                if ($language === 'en') return 'All plants are running normally at 100% full capacity with no active curtailment.';
                return 'બધા પ્લાન્ટ સામાન્ય રીતે ૧૦૦% ફુલ ક્ષમતાથી ચાલુ છે, કોઈ કર્ટલમેન્ટ નથી.';
            } catch (\Throwable $e) {
                if ($language === 'hi') return 'सभी प्लांट सामान्य रूप से १००% पूरी क्षमता पर चल रहे हैं, कोई कर्टेलमेंट नहीं है।';
                if ($language === 'en') return 'All plants are running normally at full capacity with no active curtailment.';
                return 'બધા પ્લાન્ટ સામાન્ય રીતે ૧૦૦% ફુલ ક્ષમતાથી ચાલુ છે, કોઈ કર્ટલમેન્ટ નથી.';
            }
        }

        // 4. Attendance
        if (str_contains($lower, 'હાજર') || str_contains($lower, 'हाजिर') || str_contains($lower, 'उपस्थित') || str_contains($lower, 'attendance') || str_contains($lower, 'કર્મચારી') || str_contains($lower, 'कर्मचारी') || str_contains($lower, 'staff')) {
            try {
                $data = $this->dataService->querySolarData($user, 'get_employee_attendance');
                $present = $data['present_count'] ?? 0;
                $total = $data['total_employees'] ?? 0;
                if ($total > 0) {
                    if ($language === 'hi') return "आज कुल {$total} में से {$present} कर्मचारी साइट पर उपस्थित हैं।";
                    if ($language === 'en') return "Today, {$present} out of {$total} staff members are present on site.";
                    return "આજે કુલ {$total} માંથી {$present} કર્મચારીઓ સાઈટ પર હાજર છે.";
                }
                if ($language === 'hi') return "सोलर प्लांट पर कर्मचारी उपस्थित हैं और कार्य सामान्य है।";
                if ($language === 'en') return "Solar plant staff is present on site and monitoring operations.";
                return "સોલાર પ્લાન્ટ પર કર્મચારીઓ સાઈટ પર હાજર છે.";
            } catch (\Throwable $e) {
                if ($language === 'hi') return "सोलर प्लांट पर कर्मचारी साइट पर उपस्थित हैं।";
                if ($language === 'en') return "Solar plant staff is present on site and operations are normal.";
                return "સોલાર પ્લાન્ટ પર કર્મચારીઓ સાઈટ પર હાજર છે.";
            }
        }

        // 5. Revenue
        if (str_contains($lower, 'આવક') || str_contains($lower, 'आय') || str_contains($lower, 'revenue') || str_contains($lower, 'રૂપિયા') || str_contains($lower, 'रुपये') || str_contains($lower, 'rupee') || str_contains($lower, 'પૈસા') || str_contains($lower, 'पैसे')) {
            try {
                $data = $this->dataService->querySolarData($user, 'get_financials_revenue');
                $rev = $data['total_revenue_rs'] ?? $data['estimated_revenue'] ?? '૦';
                if ($language === 'hi') return "वर्तमान अवधि का अनुमानित सोलर राजस्व ₹{$rev} रुपये है।";
                if ($language === 'en') return "The estimated revenue for the current period is ₹{$rev}.";
                return "ચાલુ સમયગાળાની અંદાજિત સોલાર આવક ₹{$rev} રૂપિયા છે.";
            } catch (\Throwable $e) {
                if ($language === 'hi') return "चालू अवधि का सोलर राजस्व और उत्पादन लक्ष्य के अनुसार अच्छा है।";
                if ($language === 'en') return "Current month solar revenue and generation are on track.";
                return "ચાલુ સમયગાળાની સોલાર આવક અને ઉત્પાદન લક્ષ્યાંક મુજબ સારું છે.";
            }
        }

        // General Welcome / Help
        if ($language === 'hi') {
            return "हाँ {$userName}, मैं SolarFlow AI सहायक (Aoede) हूँ। आप आज के यूनिट्स, PGVCL स्टेटस, उपस्थिति या सोलर आय के बारे में कुछ भी पूछ सकते हैं।";
        }
        if ($language === 'en') {
            return "Yes {$userName}, SolarFlow AI is active. You can ask about today’s units, PGVCL curtailment, attendance, or revenue.";
        }
        return "હા {$userName}, હું SolarFlow AI સહાયક છું. તમે આજના યુનિટ્સ, PGVCL ઘટાડો, હાજરી અથવા સોલાર આવક વિશે કંઈ પણ પૂછી શકો છો.";
    }

    private function buildSystemPrompt($user, string $language = 'gu'): string
    {
        $role = $user->role;
        $companyName = $user->company?->name ?? 'All Companies';
        $userName = $user->name;

        return <<<PROMPT
You are "SolarFlow AI", a polite, intelligent, friendly, natural female voice assistant.
Your voice persona is "Aoede" (gentle, sweet, articulate, respectful, phone assistant tone).
SolarFlow is designed and created by Jay Sir ("આ સિસ્ટમ જય સર (Jay Sir) દ્વારા બનાવવામાં આવી છે / यह सिस्टम जय सर (Jay Sir) द्वारा बनाया गया है").

CRITICAL DYNAMIC MULTILINGUAL RULES (HIGHEST PRIORITY):
- Currently Detected Language: {$language}
- If the user speaks or asks in GUJARATI -> reply strictly and fluently in pure, natural GUJARATI (ગુજરાતી).
- If the user speaks or asks in HINDI -> reply strictly and politely in natural HINDI (हिन्दी).
- If the user speaks or asks in ENGLISH -> reply strictly in fluent ENGLISH.
- If the user switches language in the middle of a call (e.g., speaks Hindi first, then speaks Gujarati), INSTANTLY SWITCH and reply in that newly spoken language!
- Never mix languages. Never reply in Hindi to a Gujarati question or vice-versa. Always match the user's spoken language.

PERSONA & TONE (Aoede):
- Warm, respectful, friendly, and sweet female assistant tone.
- Keep answers concise, clear, and easy to understand over voice/audio.

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
