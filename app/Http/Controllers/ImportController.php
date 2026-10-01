<?php

namespace App\Http\Controllers;

use App\Http\Requests\ImportExcelRequest;
use App\Services\ExcelImportService;
use App\Services\SolarAccessService;

class ImportController extends Controller
{
    public function __construct(
        private readonly SolarAccessService $access,
        private readonly ExcelImportService $importer,
    ) {}

    public function store(ImportExcelRequest $request): array
    {
        $this->access->requireSuperAdmin($request);

        return $this->importer->import($request->file('file'), $request->user());
    }
}
