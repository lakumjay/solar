<?php

namespace App\Http\Controllers;

use App\Http\Requests\SaveCompanyRequest;
use App\Models\Company;
use App\Models\User;
use App\Services\ActivityLogger;
use App\Services\ReadingCalculationService;
use App\Services\SolarAccessService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Throwable;

class CompanyController extends Controller
{
    public function __construct(
        private readonly SolarAccessService $access,
        private readonly ReadingCalculationService $calculator,
        private readonly ActivityLogger $activity,
    ) {}

    public function index(Request $request)
    {
        $query = Company::with([
            'inverters' => fn ($query) => $query->orderBy('id'),
            'primaryAdmin',
        ])->orderBy('name');
        if ($request->user()->role !== 'super_admin') {
            $query->whereKey($request->user()->company_id);
        }

        return $query->get()->map(fn (Company $company) => $this->payload($company));
    }

    public function store(SaveCompanyRequest $request)
    {
        $this->access->requireSuperAdmin($request);
        $data = $request->validated();
        $newLogoPath = $request->file('logo')?->store('company-logos', 'public');
        $oldLogoPath = null;

        try {
            $company = DB::transaction(function () use ($request, $data, $newLogoPath, &$oldLogoPath) {
                $companyData = collect($data)->except(['id', 'admin_email', 'password', 'logo'])->all();
                $company = isset($data['id']) ? Company::findOrFail($data['id']) : new Company;
                $oldLogoPath = $company->logo_path;
                $company->fill($companyData);
                if ($newLogoPath) {
                    $company->logo_path = $newLogoPath;
                }
                $company->save();

                $admin = $company->primaryAdmin()->first() ?? new User;
                $admin->fill([
                    'company_id' => $company->id,
                    'name' => $admin->exists ? $admin->name : $company->name.' Admin',
                    'email' => $data['admin_email'],
                    'role' => 'company_admin',
                    'active' => true,
                ]);
                if (! empty($data['password'])) {
                    $admin->password = $data['password'];
                }
                $admin->save();

                $this->calculator->recalculate($company->id);
                $this->activity->log(
                    $request->user(),
                    $company->id,
                    $company->wasRecentlyCreated ? 'created' : 'updated',
                    'company',
                    $company->id,
                    "Company {$company->name} saved",
                    collect($data)->except(['password', 'logo'])->all(),
                );

                return $company;
            });
        } catch (Throwable $error) {
            if ($newLogoPath) {
                Storage::disk('public')->delete($newLogoPath);
            }

            throw $error;
        }

        if ($newLogoPath && $oldLogoPath && $oldLogoPath !== $newLogoPath) {
            Storage::disk('public')->delete($oldLogoPath);
        }

        return $this->payload($company->load([
            'inverters' => fn ($query) => $query->orderBy('id'),
            'primaryAdmin',
        ]));
    }

    public function logo(Request $request, Company $company)
    {
        $this->access->requireCompany($request, $company->id);
        abort_unless($company->logo_path && Storage::disk('public')->exists($company->logo_path), 404);

        return Storage::disk('public')->response($company->logo_path);
    }

    private function payload(Company $company): array
    {
        $data = $company->toArray();
        unset($data['logo_path'], $data['primary_admin']);
        $data['admin_email'] = $company->primaryAdmin?->email;
        $data['logo_url'] = $company->logo_path
            ? '/api/companies/'.$company->id.'/logo?v='.$company->updated_at?->timestamp
            : null;

        return $data;
    }
}
