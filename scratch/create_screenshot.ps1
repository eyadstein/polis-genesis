[byte[]]$bytes = [Convert]::FromBase64String('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/5+hHgAFgwJ/lCw2WQAAAABJRU5ErkJggg==');
[IO.File]::WriteAllBytes('D:/polis-genesis/docs/screenshot.png', $bytes);
[IO.File]::WriteAllBytes('D:/polis-genesis/viewer/public/screenshot.png', $bytes);
