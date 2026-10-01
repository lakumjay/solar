export const PERMISSIONS = [
    ['view_dashboard', 'View dashboard'],
    ['enter_readings', 'Add daily readings'],
    ['edit_readings', 'Edit previous readings'],
    ['view_reports', 'View reports'],
    ['manage_company_users', 'Manage company users'],
    ['view_employees', 'View common employees'],
    ['manage_employees', 'Manage common employees'],
    ['view_attendance', 'View common attendance'],
    ['approve_leaves', 'Approve employee leave'],
    ['manage_attendance_settings', 'Manage holidays and attendance settings'],
    ['view_attendance_reports', 'View attendance reports'],
    ['record_employee_attendance', 'Record employee attendance'],
    ['view_stock', 'View common stock'],
    ['manage_stock', 'Manage stock items and quantity'],
    ['issue_stock', 'Give stock to borrowers'],
    ['return_stock', 'Receive returned stock'],
    ['view_expenses', 'View company expenses and balances'],
];

export const METERS = [
    ['plant_import', 'Plant Import'],
    ['plant_export', 'Plant Export'],
    ['sub_import', '66kV Sub Import'],
    ['sub_export', '66kV Sub Export'],
];

export const today = () => new Date().toISOString().slice(0, 10);
export const monthStart = () => `${today().slice(0, 7)}-01`;
