<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <meta name="theme-color" content="#15803d">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="apple-mobile-web-app-title" content="SolarFlow">
    <link rel="manifest" href="/site.webmanifest">
    <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png">
    <link rel="apple-touch-icon" href="/icons/icon-192.png">
    <title>SolarFlow</title>
    @vite(['resources/css/app.css', 'resources/js/app.js'])
    <script>
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js?v=43').then(reg => {
                    reg.update();
                }).catch(err => console.log('SW registration failed', err));
            });
        }
    </script>
</head>
<body>
    <div id="app"></div>
</body>
</html>
