# Sanar y Criar: define la cuenta administradora inicial de la plataforma en Railway.
#
# Uso (desde la carpeta sanarycriar):
#   powershell -ExecutionPolicy Bypass -File deploy\railway\fijar-admin.ps1
#
# Pide el correo y la contraseña y los guarda como variables del servicio
# "plataforma" (LEARNHOUSE_INITIAL_ADMIN_EMAIL / _PASSWORD). La contraseña va directo
# a Railway por la entrada estándar: no se muestra, no queda en archivos ni en el
# historial. Solo se usa en el PRIMER arranque (base de datos vacía); después cámbiala
# desde el panel y borra la variable LEARNHOUSE_INITIAL_ADMIN_PASSWORD en Railway.

$ErrorActionPreference = 'Stop'
$proyecto = '9e0c8e14-938d-4ec0-bc7f-037bedbb5296'   # proyecto "sanarycriar" en Railway
$OutputEncoding = New-Object System.Text.UTF8Encoding $false

function ConvertTo-Plano([Security.SecureString] $seguro) {
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro)
    try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

Write-Host ''
Write-Host 'Cuenta administradora de Sanar y Criar (Railway, servicio "plataforma")' -ForegroundColor Cyan
Write-Host ''

$correo = (Read-Host 'Correo de la administradora').Trim()
if ($correo -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') { throw 'Ese correo no parece válido.' }

$clave = ConvertTo-Plano (Read-Host 'Contraseña (12 caracteres o más)' -AsSecureString)
$repetida = ConvertTo-Plano (Read-Host 'Repite la contraseña' -AsSecureString)
if ($clave -ne $repetida) { throw 'Las contraseñas no coinciden. Vuelve a ejecutar el script.' }
if ($clave.Length -lt 12) { throw 'La contraseña debe tener al menos 12 caracteres.' }

$correo | railway variable set LEARNHOUSE_INITIAL_ADMIN_EMAIL --stdin -s plataforma -p $proyecto -e production --skip-deploys | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Railway no aceptó el correo (¿sesión iniciada con railway login?).' }
$clave | railway variable set LEARNHOUSE_INITIAL_ADMIN_PASSWORD --stdin -s plataforma -p $proyecto -e production --skip-deploys | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Railway no aceptó la contraseña.' }

$clave = $null; $repetida = $null
Write-Host ''
Write-Host "Listo: administradora $correo guardada en Railway. Ya puedes avisarle a Claude." -ForegroundColor Green
