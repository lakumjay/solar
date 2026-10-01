export async function api(path, options = {}) {
    const isFormData = options.body instanceof FormData;
    const response = await fetch(`/api/${path}`, {
        credentials: 'same-origin',
        headers: {
            ...(isFormData ? {} : {'Content-Type': 'application/json'}),
            Accept: 'application/json',
            'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.content,
        },
        ...options,
    });
    const payload = response.status === 204 ? null : await response.json().catch(() => ({}));

    if (!response.ok) {
        const validation = payload?.errors ? Object.values(payload.errors).flat()[0] : null;
        throw new Error(validation || payload?.message || 'Something went wrong.');
    }

    if (payload?.csrf_token) {
        document.querySelector('meta[name="csrf-token"]')?.setAttribute('content', payload.csrf_token);
    }

    return payload;
}
