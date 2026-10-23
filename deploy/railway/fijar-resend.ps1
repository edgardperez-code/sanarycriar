# Sanar y Criar: guarda la clave de API de Resend de la plataforma en Railway.
#
# Uso (desde la carpeta sanarycriar):
#   powershell -ExecutionPolicy Bypass -File deploy\railway\fijar-resend.ps1
#
# Pide la clave (Resend → API Keys → Create API Key; basta "Sending access" para el
# dominio sanarycriarve.com), comprueba con Resend que funciona y la guarda en la variable
# LEARNHOUSE_RESEND_API_KEY del servicio "plataforma". La clave va directo a Railway por
# la entrada estándar: no se muestra, no queda en archivos ni en el historial. Railway
# vuelve a desplegar la plataforma para que la tome (uno o dos minutos).

$ErrorActionPreference = 'Stop'
$proyecto = '9e0c8e14-938d-4ec0-bc7f-037bedbb5296'   # proyecto "sanarycriar" en Railway
$dominio = 'sanarycriarve.com'
$OutputEncoding = New-Object System.Text.UTF8Encoding $false
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

function ConvertTo-Plano([Security.SecureString] $seguro) {
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro)
    try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

Write-Host ''
Write-Host 'Correo de Sanar y Criar: clave de Resend (Railway, servicio "plataforma")' -ForegroundColor Cyan
Write-Host ''

$clave = (ConvertTo-Plano (Read-Host 'Pega la clave de API de Resend (empieza por re_)' -AsSecureString)).Trim()
if ($clave -notmatch '^re_\S+$') { throw 'Eso no parece una clave de Resend: debe empezar por re_ y no llevar espacios.' }

# Una clave de acceso completo puede listar los dominios; una de solo envío responde
# "restricted_api_key", que también prueba que la clave es válida.
try {
    $respuesta = Invoke-RestMethod -Uri 'https://api.resend.com/domains' -Headers @{ Authorization = "Bearer $clave" }
    $registro = @($respuesta.data) | Where-Object { $_.name -eq $dominio } | Select-Object -First 1
    if (-not $registro) { throw "La clave funciona, pero la cuenta de Resend no tiene el dominio $dominio." }
    Write-Host "Clave válida. Estado de $dominio en Resend: $($registro.status)"
    if ($registro.status -ne 'verified') {
        Write-Host 'Aún no está verificado: pulsa "Verify DNS Records" en Resend. Hasta entonces Resend rechaza los envíos.' -ForegroundColor Yellow
    }
} catch {
    $error_resend = $null
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
        try { $error_resend = $_.ErrorDetails.Message | ConvertFrom-Json } catch { }
    }
    if ($error_resend -and $error_resend.name -eq 'restricted_api_key') {
        Write-Host 'Clave válida (solo envío).'
    } elseif ($error_resend) {
        throw "Resend rechazó la clave: $($error_resend.message)"
    } else {
        throw
    }
}

$clave | railway variable set LEARNHOUSE_RESEND_API_KEY --stdin -s plataforma -p $proyecto -e production | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Railway no aceptó la clave (¿sesión iniciada con railway login?).' }

$clave = $null
Write-Host ''
Write-Host 'Listo: clave guardada en Railway; la plataforma se está volviendo a desplegar. Ya puedes avisarle a Claude.' -ForegroundColor Green
