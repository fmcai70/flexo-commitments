# Exports Flexo Commitments data from SQL Server so it can be imported into ActionRegister (Supabase).
#
# Run on a Windows PC that can reach the SQL Server (the same PC you use SSMS on):
#   powershell -ExecutionPolicy Bypass -File export-commitments.ps1
# Signs in with a SQL Server login (SQL Server Authentication): a box asks for the login and password,
# which are used only for this run and not saved anywhere. Add -WindowsAuth to use your Windows login instead.
#
# Writes one file: actionregister-export.json on your Desktop. It also checks that every attachment is
# present in the copied files folder (default C:\COMMITMENTS_FILES). The script only reads; it changes nothing.

param(
  [string]$Server = 'FMCERICDEV\FMCSQLSRV',
  [string]$Database = 'AccessRequestPortal',
  [string]$FilesFolder = 'C:\COMMITMENTS_FILES',
  [string]$OutFile = (Join-Path ([Environment]::GetFolderPath('Desktop')) 'actionregister-export.json'),
  [switch]$WindowsAuth
)
$ErrorActionPreference = 'Stop'

$builder = New-Object System.Data.SqlClient.SqlConnectionStringBuilder
$builder['Data Source'] = $Server
$builder['Initial Catalog'] = $Database
$builder['TrustServerCertificate'] = $true
$builder['Application Name'] = 'ActionRegister export'
$conn = New-Object System.Data.SqlClient.SqlConnection
if (-not $WindowsAuth) {
  $cred = Get-Credential -Message "SQL login for $Server"
  $pw = $cred.Password.Copy(); $pw.MakeReadOnly()
  $conn.Credential = New-Object System.Data.SqlClient.SqlCredential($cred.UserName, $pw)
} else {
  $builder['Integrated Security'] = $true
}
$conn.ConnectionString = $builder.ConnectionString

function Query([string]$sql) {
  $cmd = $conn.CreateCommand(); $cmd.CommandText = $sql; $cmd.CommandTimeout = 120
  $table = New-Object System.Data.DataTable
  $table.Load($cmd.ExecuteReader())
  $rows = @()
  foreach ($r in $table.Rows) {
    $o = [ordered]@{}
    foreach ($c in $table.Columns) {
      $v = $r[$c.ColumnName]
      if ($v -is [DBNull]) { $v = $null }
      elseif ($v -is [DateTime]) { $v = $v.ToString('yyyy-MM-ddTHH:mm:ss.fffZ') }  # stored as UTC
      elseif ($v -is [Guid]) { $v = $v.ToString('N') }
      $o[$c.ColumnName] = $v
    }
    $rows += [pscustomobject]$o
  }
  return ,$rows
}

Write-Host "Connecting to $Server / $Database ..."
$conn.Open()
try {
  $data = [ordered]@{
    exportedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    source     = "$Server/$Database"
    members    = Query @"
select m.DisplayName as name, m.Department as dept, case m.Role when 2 then 'exec' else 'manager' end as role,
       m.IsAdmin as isAdmin, m.SeesAllFiles as seesAllFiles, m.IsActive as isActive, m.SortOrder as sortOrder,
       e.Email as email, e.AdUsername as adUsername, e.FullName as fullName, e.IsAdmin as employeeIsAdmin
from CommitmentMembers m join Employees e on e.Id = m.EmployeeId
order by m.SortOrder, m.DisplayName
"@
    projects   = Query "select Id as id, [Json] as json, UpdatedAt as updatedAt, UpdatedBy as updatedBy from CommitmentProjects"
    subplans   = Query "select ProjectId as projectId, [Json] as json, UpdatedAt as updatedAt, UpdatedBy as updatedBy from CommitmentSubplans"
    files      = Query "select Id as id, Kind as kind, ParentId as parentId, FileName as fileName, SizeBytes as size, StorageKey as storageKey, UploadedBy as uploadedBy, UploadedAt as uploadedAt from CommitmentFiles"
    audit      = Query "select EntityType as entityType, EntityId as entityId, Action as action, ActingAs as actingAs, [Timestamp] as at, Details as details from CommitmentAuditLogs order by Id"
    sentReminders = Query "select [Key] as [key], SentAt as sentAt from CommitmentNotificationLogs"
  }
} finally { $conn.Close() }

$missing = @($data.files | Where-Object { -not (Test-Path -LiteralPath (Join-Path $FilesFolder $_.storageKey)) })
$json = $data | ConvertTo-Json -Depth 6 -Compress
[IO.File]::WriteAllText($OutFile, $json, (New-Object System.Text.UTF8Encoding $false))

Write-Host ''
Write-Host ("Saved {0}" -f $OutFile) -ForegroundColor Green
Write-Host ("  {0} people, {1} projects, {2} sub plans, {3} attachments, {4} history entries" -f `
  $data.members.Count, $data.projects.Count, $data.subplans.Count, $data.files.Count, $data.audit.Count)
$noEmail = @($data.members | Where-Object { -not $_.email -or $_.email -like '*@placeholder.local' })
if ($noEmail.Count) { Write-Host ("  No email on file for: {0}" -f (($noEmail | ForEach-Object name) -join ', ')) -ForegroundColor Yellow }
if ($missing.Count) {
  Write-Host ("  {0} attachment(s) not found under {1}:" -f $missing.Count, $FilesFolder) -ForegroundColor Yellow
  $missing | ForEach-Object { Write-Host ("    {0}  ({1})" -f $_.storageKey, $_.fileName) }
} else {
  Write-Host ("  All attachments found under {0}." -f $FilesFolder)
}
