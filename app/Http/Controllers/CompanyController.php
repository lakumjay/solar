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
use Illuminate\Validation\ValidationException;
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
        if ($request->user()->role === 'employee') {
            $query->where('active', true);
        } elseif ($request->user()->role !== 'super_admin') {
            $query->whereKey($request->user()->company_id);
        }

        return $query->get()->map(function (Company $company) use ($request) {
            $payload = $this->payload($company);
            if ($request->user()->role === 'employee') {
                unset($payload['admin_email']);
            }

            return $payload;
        });
    }

    public function store(SaveCompanyRequest $request)
    {
        $this->access->requireSuperAdmin($request);
        $data = $request->validated();
        $newLogoPath = $request->file('logo')?->store('company-logos', 'public');
        $newOwnerPhotoPath = $request->file('owner_photo')?->store('owner-photos', 'public');
        $oldLogoPath = null;
        $oldOwnerPhotoPath = null;

        try {
            $company = DB::transaction(function () use ($request, $data, $newLogoPath, $newOwnerPhotoPath, &$oldLogoPath, &$oldOwnerPhotoPath) {
                Company::query()->lockForUpdate()->get(['id']);
                $companyData = collect($data)->except(['id', 'admin_email', 'password', 'logo', 'owner_photo', 'is_ss_reference'])->all();
                $company = isset($data['id']) ? Company::findOrFail($data['id']) : new Company;
                $wasReference = $company->exists && $company->is_ss_reference;
                $requestedReference = array_key_exists('is_ss_reference', $data)
                    ? (bool) $data['is_ss_reference']
                    : null;

                if ($requestedReference === true && ! (bool) $data['active']) {
                    throw ValidationException::withMessages([
                        'active' => 'The Daily SS reference company must remain active.',
                    ]);
                }

                if ($wasReference && (! (bool) $data['active'] || $requestedReference === false)) {
                    throw ValidationException::withMessages([
                        'is_ss_reference' => 'Select another active Daily SS reference company before changing or deactivating this company.',
                    ]);
                }

                $oldLogoPath = $company->logo_path;
                $oldOwnerPhotoPath = $company->owner_photo_path;
                $company->fill($companyData);
                if ($newLogoPath) {
                    $company->logo_path = $newLogoPath;
                }
                if ($newOwnerPhotoPath) {
                    $company->owner_photo_path = $newOwnerPhotoPath;
                }
                $company->save();

                if ($requestedReference === true) {
                    Company::whereKeyNot($company->id)->update(['is_ss_reference' => false]);
                    $company->forceFill(['is_ss_reference' => true])->save();
                } elseif (! Company::where('is_ss_reference', true)->exists() && $company->active) {
                    $company->forceFill(['is_ss_reference' => true])->save();
                }

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
                    collect($data)->except(['password', 'logo', 'owner_photo'])->all(),
                );

                return $company;
            });
        } catch (Throwable $error) {
            if ($newLogoPath) {
                Storage::disk('public')->delete($newLogoPath);
            }
            if ($newOwnerPhotoPath) {
                Storage::disk('public')->delete($newOwnerPhotoPath);
            }

            throw $error;
        }

        if ($newLogoPath && $oldLogoPath && $oldLogoPath !== $newLogoPath) {
            Storage::disk('public')->delete($oldLogoPath);
        }
        if ($newOwnerPhotoPath && $oldOwnerPhotoPath && $oldOwnerPhotoPath !== $newOwnerPhotoPath) {
            Storage::disk('public')->delete($oldOwnerPhotoPath);
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

    public function ownerPhoto(Request $request, Company $company)
    {
        $this->access->requireCompany($request, $company->id);
        abort_unless($company->owner_photo_path && Storage::disk('public')->exists($company->owner_photo_path), 404);

        return Storage::disk('public')->response($company->owner_photo_path);
    }

    private function payload(Company $company): array
    {
        $data = $company->toArray();
        unset($data['logo_path'], $data['owner_photo_path'], $data['primary_admin']);
        $data['admin_email'] = $company->primaryAdmin?->email;
        $data['logo_url'] = $company->logo_path
            ? '/api/companies/'.$company->id.'/logo?v='.$company->updated_at?->timestamp
            : null;
        $data['owner_photo_url'] = $company->owner_photo_path
            ? '/api/companies/'.$company->id.'/owner-photo?v='.$company->updated_at?->timestamp
            : null;

        return $data;
    }
}
