# Sanar y Criar: guarda la clave de API de Anthropic (Claude) de la plataforma en Railway.
#
# Uso (desde la carpeta sanarycriar):
#   powershell -ExecutionPolicy Bypass -File deploy\railway\fijar-anthropic.ps1
#
# Es la clave del blog con IA ("Crear con IA" y "Mejorar con IA" en el panel). Créala en
# la consola de Anthropic (Settings → API Keys) y, ANTES de usarla, pon un tope de gasto
# mensual en Settings → Limits: cada artículo cuesta unos US$0,10–0,30.
#
# Pide la clave, comprueba con Anthropic que funciona y que puede usar el modelo
# claude-opus-5-5, y la guarda en la variable ANTHROPIC_API_KEY del servicio "plataforma".
# La clave va directo a Railway por la entrada estándar: no se muestra, no queda en
# archivos ni en el historial. Railway vuelve a desplegar la plataforma sola para que la
# tome (uno o dos minutos). Nunca pongas SC_BLOG_AI_MOCK en producción.

$ErrorActionPreference = 'Stop'
$proyecto = '9e0c8e14-938d-4ec0-bc7f-037bedbb5296'   # proyecto "sanarycriar" en Railway
$modelo = 'claude-opus-5-5'
$OutputEncoding = New-Object System.Text.UTF8Encoding $false
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

function ConvertTo-Plano([Security.SecureString] $seguro) {
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro)
    try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

Write-Host ''
Write-Host 'Blog con IA de Sanar y Criar: clave de Anthropic (Railway, servicio "plataforma")' -ForegroundColor Cyan
Write-Host 'Recuerda: pon un tope de gasto mensual en la consola de Anthropic (Settings -> Limits).' -ForegroundColor Yellow
Write-Host ''

$clave = (ConvertTo-Plano (Read-Host 'Pega la clave de API de Anthropic (empieza por sk-ant-)' -AsSecureString)).Trim()
if ($clave -notmatch '^sk-ant-\S+$') { throw 'Eso no parece una clave de Anthropic: debe empezar por sk-ant- y no llevar espacios.' }

# Pedir la ficha del modelo prueba la clave y que la cuenta puede usar ese modelo, sin gastar nada.
try {
    $respuesta = Invoke-RestMethod -Uri "https://api.anthropic.com/v1/models/$modelo" -Headers @{ 'x-api-key' = $clave; 'anthropic-version' = '2026-10-21' }
    Write-Host "Clave válida. Modelo disponible: $($respuesta.id)"
} catch {
    $estado = $null
    if ($_.Exception.Response) { $estado = [int]$_.Exception.Response.StatusCode }
    if ($estado -eq 401) { throw 'Anthropic rechazó la clave (401): no es válida o fue revocada.' }
    if ($estado -eq 403) { throw 'La clave no tiene permiso (403): revisa el espacio de trabajo y los permisos en la consola de Anthropic.' }
    if ($estado -eq 404) { throw "El modelo $modelo no está disponible para esta clave (404)." }
    throw
}

$clave | railway variable set ANTHROPIC_API_KEY --stdin -s plataforma -p $proyecto -e production | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Railway no aceptó la clave (¿sesión iniciada con railway login?).' }

$clave = $null
Write-Host ''
Write-Host 'Listo: clave guardada en Railway; la plataforma se está volviendo a desplegar sola. Ya puedes avisarle a Claude.' -ForegroundColor Green
