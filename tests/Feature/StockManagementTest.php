<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Employee;
use App\Models\StockBorrowing;
use App\Models\StockItem;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class StockManagementTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_creates_common_stock_item_with_image_and_opening_quantity(): void
    {
        Storage::fake('local');
        $admin = $this->admin('First Solar');

        $response = $this->actingAs($admin)->withHeader('Accept', 'application/json')->post('/api/stock/items', [
            'name' => 'Drill Machine',
            'image' => UploadedFile::fake()->image('drill.jpg'),
            'unit_price' => '5000.00',
            'opening_quantity' => '10.00',
            'low_stock_threshold' => '2.00',
            'notes' => 'Workshop tool',
            'active' => '1',
        ]);

        $response->assertOk()->assertJsonPath('name', 'Drill Machine')->assertJsonPath('total_quantity', 10)->assertJsonPath('available_quantity', 10)->assertJsonPath('borrowed_quantity', 0)->assertJsonPath('total_value', 50000)->assertJsonMissingPath('image_path');
        $item = StockItem::firstOrFail();
        Storage::assertExists($item->image_path);
        $this->assertDatabaseHas('stock_movements', ['stock_item_id' => $item->id, 'type' => 'opening', 'quantity' => 10]);

        $this->actingAs($admin)->getJson('/api/stock/items')->assertOk()
            ->assertJsonPath('summary.total_items', 1)
            ->assertJsonPath('summary.total_quantity', 10)
            ->assertJsonPath('summary.available_quantity', 10)
            ->assertJsonPath('summary.total_value', 50000)
            ->assertJsonPath('items.0.movements.0.type', 'opening')
            ->assertJsonPath('items.0.movements.0.creator.name', $admin->name);
    }

    public function test_stock_can_be_issued_and_returned_in_multiple_parts(): void
    {
        $admin = $this->admin('Issue Solar');
        $employeeUser = User::factory()->create(['role' => 'employee', 'company_id' => null, 'active' => true]);
        Employee::create(['user_id' => $employeeUser->id, 'employee_code' => 'EMP-STOCK', 'active' => true]);
        $item = StockItem::create(['name' => 'Drill Machine', 'image_path' => 'stock-items/drill.jpg', 'unit_price' => 5000, 'total_quantity' => 5, 'low_stock_threshold' => 1, 'active' => true, 'created_by' => $admin->id]);

        $borrowingResponse = $this->actingAs($admin)->postJson('/api/stock/borrowings', [
            'stock_item_id' => $item->id,
            'borrower_name' => 'ABC Contractor',
            'borrower_mobile' => '9876543210',
            'quantity' => 3,
            'borrowed_on' => '2026-09-20',
            'expected_return_date' => '2026-09-25',
            'given_by_user_id' => $employeeUser->id,
            'notes' => 'Site work',
        ]);
        $borrowingResponse->assertOk()->assertJsonPath('status', 'pending')->assertJsonPath('pending_quantity', 3)->assertJsonPath('given_by.name', $employeeUser->name);
        $borrowing = StockBorrowing::firstOrFail();

        $this->actingAs($admin)->getJson('/api/stock/items')->assertJsonPath('items.0.available_quantity', 2)->assertJsonPath('items.0.borrowed_quantity', 3);
        $this->actingAs($admin)->postJson('/api/stock/borrowings', [
            'stock_item_id' => $item->id, 'borrower_name' => 'Second Borrower', 'quantity' => 3,
            'borrowed_on' => '2026-09-20', 'given_by_user_id' => $admin->id,
        ])->assertUnprocessable()->assertJsonValidationErrors('quantity');

        $this->actingAs($admin)->postJson("/api/stock/borrowings/{$borrowing->id}/returns", [
            'quantity' => 1,
            'returned_on' => '2026-09-22',
            'received_by_user_id' => $admin->id,
            'notes' => 'First partial return',
        ])->assertOk()->assertJsonPath('status', 'partially_returned')->assertJsonPath('returned_quantity', '1.00')->assertJsonPath('pending_quantity', 2)->assertJsonCount(1, 'returns');

        $this->actingAs($admin)->postJson("/api/stock/borrowings/{$borrowing->id}/returns", [
            'quantity' => 2,
            'returned_on' => '2026-09-24',
            'received_by_user_id' => $admin->id,
        ])->assertOk()->assertJsonPath('status', 'returned')->assertJsonPath('pending_quantity', 0)->assertJsonCount(2, 'returns');

        $this->actingAs($admin)->getJson('/api/stock/items')->assertJsonPath('items.0.total_quantity', 5)->assertJsonPath('items.0.available_quantity', 5)->assertJsonPath('items.0.borrowed_quantity', 0);
    }

    public function test_stock_in_updates_quantity_price_and_movement_history(): void
    {
        $manager = User::factory()->create(['company_id' => Company::create(['name' => 'Manager Solar'])->id, 'role' => 'manager']);
        $item = StockItem::create(['name' => 'Safety Helmet', 'image_path' => 'stock-items/helmet.jpg', 'unit_price' => 300, 'total_quantity' => 4, 'active' => true]);

        $this->actingAs($manager)->postJson("/api/stock/items/{$item->id}/add", [
            'quantity' => 2.5,
            'unit_price' => 325,
            'notes' => 'New purchase',
        ])->assertOk()->assertJsonPath('total_quantity', 6.5)->assertJsonPath('unit_price', 325)->assertJsonPath('total_value', 2112.5);

        $this->assertDatabaseHas('stock_movements', ['stock_item_id' => $item->id, 'type' => 'stock_in', 'quantity' => 2.5, 'created_by' => $manager->id]);
    }

    public function test_stock_is_common_across_companies_and_permission_is_enforced(): void
    {
        $firstAdmin = $this->admin('Alpha Solar');
        $secondAdmin = $this->admin('Beta Solar');
        StockItem::create(['name' => 'Common Ladder', 'image_path' => 'stock-items/ladder.jpg', 'unit_price' => 1200, 'total_quantity' => 2, 'active' => true, 'created_by' => $firstAdmin->id]);

        $this->actingAs($secondAdmin)->getJson('/api/stock/items')->assertOk()->assertJsonPath('items.0.name', 'Common Ladder');
        $viewer = User::factory()->create(['company_id' => $secondAdmin->company_id, 'role' => 'viewer']);
        $this->actingAs($viewer)->getJson('/api/stock/items')->assertForbidden();
        $this->actingAs($viewer)->postJson('/api/stock/borrowings', [])->assertForbidden();
    }

    public function test_stock_image_is_only_available_to_authorized_users(): void
    {
        Storage::fake('local');
        Storage::put('stock-items/tool.jpg', 'image');
        $admin = $this->admin('Image Solar');
        $item = StockItem::create(['name' => 'Tool', 'image_path' => 'stock-items/tool.jpg', 'unit_price' => 10, 'total_quantity' => 1, 'active' => true]);

        $this->actingAs($admin)->get("/api/stock/items/{$item->id}/image")->assertOk();
        $viewer = User::factory()->create(['company_id' => $admin->company_id, 'role' => 'viewer']);
        $this->actingAs($viewer)->get("/api/stock/items/{$item->id}/image")->assertForbidden();
    }

    public function test_employee_can_manage_issue_and_receive_common_stock(): void
    {
        Storage::fake('local');
        $employeeUser = User::factory()->create([
            'role' => 'employee',
            'company_id' => null,
            'permissions' => ['clock_attendance', 'enter_readings', 'view_stock', 'manage_stock', 'issue_stock', 'return_stock'],
            'active' => true,
        ]);
        Employee::create(['user_id' => $employeeUser->id, 'employee_code' => 'EMP-STOCK-MANAGER', 'active' => true]);

        $itemResponse = $this->actingAs($employeeUser)->post('/api/stock/items', [
            'name' => 'Employee Managed Tool',
            'image' => UploadedFile::fake()->image('employee-tool.jpg'),
            'unit_price' => '1250.00',
            'opening_quantity' => '3.00',
            'low_stock_threshold' => '1.00',
            'active' => '1',
        ])->assertOk()->assertJsonPath('total_quantity', 3);
        $itemId = $itemResponse->json('id');

        $this->actingAs($employeeUser)->getJson('/api/stock/items')
            ->assertOk()
            ->assertJsonPath('items.0.name', 'Employee Managed Tool');

        $borrowingResponse = $this->actingAs($employeeUser)->postJson('/api/stock/borrowings', [
            'stock_item_id' => $itemId,
            'borrower_name' => 'Site Contractor',
            'quantity' => 1,
            'borrowed_on' => '2026-09-21',
            'given_by_user_id' => $employeeUser->id,
        ])->assertOk()->assertJsonPath('pending_quantity', 1);

        $this->actingAs($employeeUser)->postJson('/api/stock/borrowings/'.$borrowingResponse->json('id').'/returns', [
            'quantity' => 1,
            'returned_on' => '2026-09-21',
            'received_by_user_id' => $employeeUser->id,
        ])->assertOk()->assertJsonPath('status', 'returned');
    }

    private function admin(string $companyName): User
    {
        return User::factory()->create(['company_id' => Company::create(['name' => $companyName])->id, 'role' => 'company_admin']);
    }
}
