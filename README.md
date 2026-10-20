# 🦫 BeaverBank

> 비버가 댐으로 물길을 나누듯, 내 돈을 용도별 계좌로 나눠 관리하는 개인용 데스크톱 앱

BeaverBank는 여러 계좌(적금, 용도별 통장)와 매달 반복되는 돈의 흐름(수입, 분배 이체, 정기 결제)을 한눈에 보여줍니다.
잔액은 등록한 규칙으로 자동 계산하고, 실제 잔액과 다를 때만 보정합니다.

## 주요 기능 (계획)

- **계좌 관리**: 입출금, 적금, 예금, 파킹통장, CMA, 투자 계좌를 용도별로 분류
- **정기 흐름**: 수입 / 계좌 간 분배 이체 / 정기 결제를 하나의 규칙으로 관리
- **잔액 자동 계산**: `현재 잔액 = 마지막 보정 잔액 + 이후 실행된 정기 흐름의 합`
- **대시보드**: 총자산과 용도별 비중, 이번 달 나갈 돈, 적금 진행률과 만기, 잔액 변화 추이
- **AI 연동 (MCP)**: 데모부터 연결하는 로컬 stdio 서버, 읽기 8개·선택적 쓰기 16개 도구와 화면 자동 반영
- **AI 채팅창**: 오른쪽에서 Claude Code로 대화하고, 기입마다 확인 카드로 결정 (Codex 준비 중)
- **바탕화면 위젯**: 반투명 위젯으로 핵심 숫자 표시

## 기술 스택

| 영역 | 사용 기술 |
|---|---|
| 앱 | Electron + electron-vite |
| 화면 | React + TypeScript + Tailwind CSS |
| 효과 / 차트 | ECharts |
| DB | SQLite (better-sqlite3) + Drizzle ORM |

## 개인정보 보호

- 앱의 데이터는 로컬 SQLite 파일에 저장되며, 저장 위치는 프로젝트 폴더 밖(`%APPDATA%\BeaverBank`)입니다.
- MCP 서버를 등록해 AI가 읽은 데이터는 그 AI 서비스로 전송됩니다. 아래 개인 정보 안내를 읽고 연결 범위를 선택하세요.
- DB 파일과 `.env`는 `.gitignore`로 커밋에서 제외됩니다.
- 저장소의 샘플 데이터와 스크린샷은 모두 가짜 데이터입니다.

## 데모 실행

`npm run demo`를 실행하면 가짜 데이터가 채워진 앱을 띄울 수 있습니다.
실제 DB와 개발 DB를 건드리지 않고, 별도 데이터 폴더 `%APPDATA%\BeaverBank-demo`만 사용합니다.
실행할 때마다 데모 데이터는 처음 상태로 돌아갑니다.

## AI 연동 (MCP)

### 할 수 있는 일

Claude Code, Claude 데스크톱, Codex에 로컬 **stdio** 서버를 등록하면 계좌·카드·잔액·정기 흐름을 질문할 수 있습니다. 기본은 **데모 데이터·읽기 전용·메모 제외**입니다. 쓰기를 따로 켜면 등록·수정·상태 변경·잔액 보정도 할 수 있습니다. 건별 지출 가계부나 은행 이체 기능은 아닙니다.

금액은 **원 단위 정수**, 날짜는 **YYYY-MM-DD**, 대상은 조회 결과의 정수 `id`로 지정합니다. 서버가 기입하면 열린 앱의 현재 페이지가 3초 안에 갱신되고 화면 상태는 유지됩니다. 팝업이 열려 있으면 입력을 보존하고, 마지막 팝업이 닫힌 뒤 1초 안에 반영합니다.

| 도구 | 구분 | 묶음 | 설명 |
| --- | --- | --- | --- |
| `get_status` | 읽기 | 상태 | 연결 대상, 쓰기·메모 설정, DB 상태·행 수, 백업·기록 위치와 개인 정보 안내 |
| `get_dashboard` | 읽기 | 조회 | 총자산, 용도별 금액, 월간 흐름과 적금·예금 진행 |
| `list_purposes` | 읽기 | 조회 | 정렬된 용도와 연결 계좌 수 |
| `list_accounts` | 읽기 | 조회 | 계좌, 지정 날짜의 잔액과 적금·예금 정보 |
| `list_cards` | 읽기 | 조회 | 카드와 연결 계좌·흐름 수 |
| `list_flows` | 읽기 | 조회 | 정기 흐름과 연결 대상·상태 |
| `get_month_flows` | 읽기 | 조회 | 선택 월의 회차, 예외와 합계·월말 잔액 |
| `list_balance_corrections` | 읽기 | 조회 | 지정 계좌의 보정 이력과 차이 |
| `add_purpose` | 쓰기 | 등록·수정 (9개) | 용도 등록 |
| `update_purpose` | 쓰기 | 등록·수정 | 용도 이름·색 수정 |
| `add_account` | 쓰기 | 등록·수정 | 계좌와 필요한 적금·예금 정보 등록 |
| `update_account` | 쓰기 | 등록·수정 | 계좌의 지정한 항목 수정 |
| `add_card` | 쓰기 | 등록·수정 | 카드 등록 |
| `update_card` | 쓰기 | 등록·수정 | 카드의 지정한 항목 수정 |
| `add_flow` | 쓰기 | 등록·수정 | 정기 흐름 등록 |
| `update_flow` | 쓰기 | 등록·수정 | 흐름 수정, 금액 등 변경 시 적용 시작일부터 분리 |
| `adjust_occurrence` | 쓰기 | 등록·수정 | 한 회차의 금액 변경·건너뛰기·원래대로 |
| `close_account` | 쓰기 | 상태 변경 (6개) | 계좌 해지 |
| `restore_account` | 쓰기 | 상태 변경 | 해지 계좌 복구 |
| `close_card` | 쓰기 | 상태 변경 | 카드 해지 |
| `restore_card` | 쓰기 | 상태 변경 | 해지 카드 복구 |
| `end_flow` | 쓰기 | 상태 변경 | 흐름 종료 |
| `resume_flow` | 쓰기 | 상태 변경 | 흐름 종료 취소 |
| `correct_balance` | 쓰기 | 잔액 보정 (1개) | 지정 날짜의 실제 잔액 저장·덮어쓰기 |

수정 입력에서 생략한 항목은 유지하고, 비울 수 있는 항목은 `null`로 비웁니다. 영구 삭제·순서 변경 도구는 제공하지 않습니다.

### 개인 정보 안내

**AI가 도구로 읽은 계좌·카드 이름, 금융기관, 끝자리, 금액·잔액, 날짜, 정기 흐름과 `--memos` 사용 시 메모는 연결한 AI 서비스의 서버로 전송됩니다.** 전송된 뒤의 보관·사용은 해당 서비스의 약관과 설정을 따르며 **BeaverBank가 통제할 수 없습니다.** 서버 자체는 도구 결과 외에 사용 통계나 오류 보고를 외부로 보내지 않습니다.

먼저 가짜 데모 데이터로 시험하세요. 실제 데이터는 이 안내를 읽고 아래 별도 단계에서 사용자가 `--data real`을 직접 지정해야 연결됩니다. 쓰기와 메모 공개도 각각 따로 켭니다.

### 준비

이 절은 Windows에서 **저장소를 빌드해 실행하는 앱** 기준입니다. **Node.js 22 이상**이 필요하며 확인한 환경은 **Node 24**입니다. `C:\path\to\BeaverBank`는 자신의 저장소 경로로 바꾸세요.

```powershell
cd C:\path\to\BeaverBank
node --version
npm install
npm run build
```

빌드 결과 서버 파일은 `out\mcp\server.cjs`(CommonJS)입니다. 서버는 PC의 `node`로 이 파일을 직접 실행합니다. 서버 실행에 `npm run`, 환경 변수 설정, 추가 네이티브 모듈 재빌드는 필요하지 않습니다. 다음은 상태를 출력하고 종료하는 확인용 명령입니다. 데모 생성 전에는 `no_database`일 수 있습니다.

```powershell
node "C:\path\to\BeaverBank\out\mcp\server.cjs" --data demo --check
```

`--check`는 표준 출력에 한국어로 데이터 대상·쓰기·메모·DB 경로·DB 상태와 상태 JSON을 보여 줍니다. `DB 상태: ready`이면 종료 코드 **0**, 준비되지 않았거나 오류이면 **1**입니다. PowerShell에서는 바로 뒤의 `$LASTEXITCODE`로 확인합니다. 일반 stdio 실행의 표준 출력은 MCP 메시지만 사용하며, 기동 정보는 표준 오류로 나옵니다.

| 실행 옵션 | 값 | 기본 | 뜻 |
| --- | --- | --- | --- |
| `--data` | `demo` 또는 `real` | `demo` | 데모 또는 실제 데이터 선택 |
| `--write` | 값 없음 | 꺼짐 | 쓰기 도구 16개 추가 노출 (총 24개) |
| `--memos` | 값 없음 | 꺼짐 | 결과에 메모 원문 공개, 기본은 `hasMemo`만 제공 |
| `--data-root` | 이미 존재하는 절대 폴더 | `%APPDATA%` | 그 아래 `BeaverBank-demo` 또는 `BeaverBank` 폴더 선택 |
| `--check` | 값 없음 | 꺼짐 | 상태 출력 후 종료 |

`--data-root`는 DB 파일이나 `BeaverBank-demo` 폴더 자체가 아닌 **그 상위 기준 폴더**입니다. `APPDATA`가 없을 때 기본 기준 폴더는 `%USERPROFILE%\AppData\Roaming`입니다. 서버는 DB·마이그레이션·데모 데이터를 만들지 않습니다. 먼저 앱으로 데이터를 준비해야 합니다. 읽기 전용 조회도 SQLite의 `-wal`·`-shm` 보조 파일을 만들 수 있지만 DB 본체를 기입하지 않습니다.

### 데모 연결

먼저 저장소에서 다음을 **한 번 실행해 데모 데이터를 만든 뒤** 클라이언트에 등록합니다.

```powershell
npm run demo
```

데모는 `%APPDATA%\BeaverBank-demo\beaverbank-dev.sqlite`를 사용합니다. **데모 앱을 다시 실행할 때마다 데모가 초기화됩니다.** 서버의 쓰기 결과를 확인할 때는 열려 있는 앱을 유지하세요. 기존 데모를 보존해야 한다면 아래 임시 데모 절차를 사용하세요.

등록 후 `get_status`에서 `source=demo`, `write=false`, `memos=false`, `database.state=ready`인지 확인합니다. 읽기 도구 8개가 보여야 합니다. `BeaverBank 계좌를 보여 줘`, `이번 달 정기 결제와 월말 잔액을 보여 줘`, `어느 데이터에 연결돼 있고 쓰기가 켜져 있어?`라고 물어볼 수 있습니다. 처음 데모의 활성 계좌는 9개입니다.

#### Claude Code

사용자 범위에 stdio 서버를 등록합니다. 프로젝트 범위 등록은 사용하지 않습니다.

```powershell
claude mcp add --transport stdio --scope user beaverbank-demo -- node "C:\path\to\BeaverBank\out\mcp\server.cjs" --data demo
claude mcp list
```

등록 제거:

```powershell
claude mcp remove --scope user beaverbank-demo
```

#### Claude 데스크톱

사용자 설정 `%APPDATA%\Claude\claude_desktop_config.json`의 기존 `mcpServers`에 아래 항목을 합칩니다. 기존 다른 서버 항목은 보존하고, 적용 후 Claude 데스크톱을 완전히 종료했다 다시 시작하세요.

```json
{
  "mcpServers": {
    "beaverbank-demo": {
      "command": "node",
      "args": ["C:\\path\\to\\BeaverBank\\out\\mcp\\server.cjs", "--data", "demo"]
    }
  }
}
```

등록 제거는 같은 사용자 설정에서 `mcpServers`의 **`beaverbank-demo` 항목만 삭제**한 뒤 앱을 완전히 재시작합니다.

#### Codex

사용자 설정에 등록합니다. 저장소 안에 `.codex`나 프로젝트 설정을 만들지 않습니다.

```powershell
codex mcp add beaverbank-demo -- node "C:\path\to\BeaverBank\out\mcp\server.cjs" --data demo
codex mcp list
```

같은 내용을 기본 사용자 설정 `%USERPROFILE%\.codex\config.toml`에 직접 합칠 수도 있습니다. 명령과 직접 편집 중 하나만 선택하세요. 기존 다른 설정은 보존합니다.

```toml
[mcp_servers.beaverbank-demo]
command = "node"
args = ['C:\path\to\BeaverBank\out\mcp\server.cjs', "--data", "demo"]
```

등록 제거 후 필요하면 Codex를 재시작합니다.

```powershell
codex mcp remove beaverbank-demo
```

#### 기존 데모를 보존하며 연결 시험하기 (선택)

다음은 **사용자가 창을 띄워 시험할 때** 수행하는 절차입니다. 새 임시 appData에 앱 자체의 데모 초기화·시드를 실행합니다. 빌드 후 PowerShell에서 저장소 경로를 바꾸고 임시 폴더를 만드세요.

```powershell
$repo = 'C:\path\to\BeaverBank'
$checkRoot = Join-Path $env:TEMP ('beaverbank-check-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $checkRoot | Out-Null
$entry = Join-Path $checkRoot 'demo-entry.cjs'
```

`$entry` 위치의 새 파일에 다음 JavaScript를 저장합니다. 저장소 파일은 바꾸지 않습니다.

```javascript
const { app } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const [repo, root] = process.argv.slice(2)
app.setAppPath(repo)
app.setPath('appData', root)
for (const key of ['userData', 'sessionData', 'crashDumps']) {
  const folder = path.join(root, key)
  fs.mkdirSync(folder, { recursive: true })
  app.setPath(key, folder)
}
app.setAppLogsPath(path.join(root, 'logs'))
process.argv.push('--demo')
require(path.join(repo, 'out', 'main', 'index.js'))
```

위 PowerShell에서 앱을 실행합니다. 이 명령은 시험용 창을 표시합니다.

```powershell
& "$repo\node_modules\electron\dist\electron.exe" $entry $repo $checkRoot
```

같은 PowerShell의 `$checkRoot`가 기준 폴더입니다. 세 클라이언트의 데모 등록 인수 맨 뒤에 `--data-root`와 **이 폴더의 절대 경로**를 추가하세요.

```powershell
node "$repo\out\mcp\server.cjs" --data demo --data-root "$checkRoot" --check
claude mcp add --transport stdio --scope user beaverbank-demo -- node "$repo\out\mcp\server.cjs" --data demo --data-root "$checkRoot"
codex mcp add beaverbank-demo -- node "$repo\out\mcp\server.cjs" --data demo --data-root "$checkRoot"
```

데스크톱 JSON의 `args`에도 같은 두 인수(예: `"--data-root", "C:\\path\\to\\isolated-appdata"`)를 추가하되 실제 시험 폴더로 바꿉니다. Codex TOML은 `"--data-root", 'C:\path\to\isolated-appdata'`를 추가합니다. 같은 이름의 등록이 이미 있으면 위 제거 방법으로 그 시험 등록만 지운 뒤 다시 등록하세요. 이 앱도 재실행하면 **임시 데모만 초기화**됩니다. 시험 중에는 앱을 재시작하지 말고 한 클라이언트씩 독립된 임시 폴더로 확인하세요.

아래 방법으로 `--write`를 추가한 뒤 가짜 흐름 등록, 열린 페이지의 3초 반영, 잘못된 날짜의 한국어 오류를 확인합니다. 최소화·가림 복귀와 팝업 입력 보존도 이 임시 앱에서 확인할 수 있습니다. 끝나면 각 시험 등록을 제거하고 앱·서버를 종료합니다. 저장소에서는 다음 읽기 전용 검사로 개인 자료·설정이 추가되지 않았는지 확인하세요.

```powershell
git status --porcelain --untracked-files=all
git ls-files
```

두 출력에 `.sqlite`, `.sqlite-wal`, `.sqlite-shm`, `.jsonl`, `.mcp.json`, `.codex`, `claude_desktop_config.json`, `config.toml`이 든 파일이 없어야 합니다.

### 실제 데이터 연결

개인 정보 안내를 읽고 실제 금융 데이터를 AI 서비스로 보내기로 결정했을 때만 진행합니다. 저장소의 일반 앱을 한 번 실행해 데이터를 준비한 뒤, 데모와 별개 이름 **`beaverbank`**로 등록합니다. 서버 파일과 실행 파일은 같고 `--data demo`를 **`--data real`**로 바꿉니다. 읽기 전용·메모 제외는 유지됩니다.

```powershell
claude mcp add --transport stdio --scope user beaverbank -- node "C:\path\to\BeaverBank\out\mcp\server.cjs" --data real
codex mcp add beaverbank -- node "C:\path\to\BeaverBank\out\mcp\server.cjs" --data real
```

데스크톱은 `mcpServers`의 이름을 `beaverbank`로, `args`의 `demo`를 `real`로 바꾼 항목을 추가합니다. Codex의 직접 편집 방식은 `[mcp_servers.beaverbank]` 아래 같은 `command`와 `args`를 씁니다. 사용자 설정만 사용합니다. `get_status`의 `source=real`을 확인하고, 필요 없는 데모 등록은 제거하세요.

현재 서버는 `%APPDATA%\BeaverBank\beaverbank-dev.sqlite`를 읽습니다. 패키징한 배포 앱의 `beaverbank.sqlite`를 선택하는 옵션은 없습니다. 임시 데이터는 실제 대상 옵션이라도 `--data-root`로 **임시 상위 폴더**를 명시하세요.

실제 등록 제거는 Code에서 `claude mcp remove --scope user beaverbank`, Codex에서 `codex mcp remove beaverbank`, 데스크톱에서는 사용자 설정의 `beaverbank` 항목만 삭제한 뒤 재시작합니다.

### 쓰기 켜기

처음에는 데모에서만 시험하세요. **쓰기 도구를 부를 때마다 클라이언트가 바꿀 내용을 설명하고 사용자 확인을 받도록 설정하는 것을 권고합니다.** `--write`는 서버 쓰기를 허용하며, 클라이언트의 확인 절차를 강제하는 옵션은 아닙니다.

기존 시험 등록을 위 방법으로 제거한 뒤, 같은 등록 명령 끝에 `--write`를 추가해 다시 등록합니다.

```powershell
claude mcp add --transport stdio --scope user beaverbank-demo -- node "C:\path\to\BeaverBank\out\mcp\server.cjs" --data demo --write
codex mcp add beaverbank-demo -- node "C:\path\to\BeaverBank\out\mcp\server.cjs" --data demo --write
```

데스크톱 JSON·Codex TOML은 해당 등록의 `args` 끝에 `"--write"`를 추가하고 클라이언트를 재시작합니다. 임시 데모의 `--data-root`도 유지하세요. 도구는 총 24개, `get_status.write`는 `true`여야 합니다. 실제 데이터는 등록 `beaverbank`와 `--data real`에 같은 방식으로 `--write`만 추가합니다.

메모 원문 공개는 별도 옵션 **`--memos`**로만 켭니다. 이 옵션은 메모가 AI 서비스로 전송되는 범위를 늘립니다. 쓰기를 켜도 메모 공개가 자동으로 켜지지는 않습니다. 쓰기를 끄려면 `--write`를 뺀 등록으로 되돌리고 재시작합니다.

### 백업과 되돌리기

서버는 **세션의 첫 쓰기 때 기입 전 백업을 한 번** 만듭니다. 입력 구조 검사를 통과한 뒤 업무 검증에 실패한 첫 쓰기도 백업 대상입니다. 백업에 실패하면 기입하지 않습니다. 같은 세션의 후속 쓰기는 새 백업을 만들지 않습니다.

| 대상 | 원 DB | 백업 폴더 | 기입 기록 폴더 |
| --- | --- | --- | --- |
| 데모 | `%APPDATA%\BeaverBank-demo\beaverbank-dev.sqlite` | `%APPDATA%\BeaverBank-demo\mcp\backups` | `%APPDATA%\BeaverBank-demo\mcp` |
| 실제 | `%APPDATA%\BeaverBank\beaverbank-dev.sqlite` | `%APPDATA%\BeaverBank\mcp\backups` | `%APPDATA%\BeaverBank\mcp` |

`--data-root`를 썼다면 표의 `%APPDATA%`를 그 기준 폴더로 바꿉니다. 백업 이름은 현지 시각의 `beaverbank-dev-YYYYMMDD-HHmmss.sqlite`이고 같은 초의 충돌에는 `-2`, `-3` 같은 숫자 접미사가 붙습니다. 서버 이름 규칙에 맞는 **최근 20개**를 보관합니다. 별도 이름의 사용자 사본은 이 정리 대상이 아닙니다. 첫 쓰기 응답의 `backup.file`, 상태 도구의 `backup.sessionFile`로 이번 세션의 백업을 확인합니다.

되돌릴 때는 다음 순서를 지키세요.

1. **BeaverBank 앱과 서버를 실행하는 모든 AI 클라이언트를 종료**하고 해당 서버 프로세스도 끝났는지 확인합니다.
2. 현재 `beaverbank-dev.sqlite`와 같은 이름의 `beaverbank-dev.sqlite-wal`, `beaverbank-dev.sqlite-shm` 파일이 있으면 **함께 별도 폴더로 옮겨 보관**합니다. 원 DB 자리에는 남기지 않습니다.
3. `mcp\backups`에서 원하는 기입 전 백업을 **복사**해 원 DB 폴더에 `beaverbank-dev.sqlite`라는 이름으로 놓습니다. 백업 원본은 남겨 둡니다.
4. 일반 앱을 시작하고 데이터가 돌아왔는지 확인합니다.

**데모 앱 재실행은 복원한 데모도 초기화합니다.** 데모 복원 검증은 앱을 재실행하기 전에 읽기 전용 서버를 다시 켜서 확인하세요(첫 쓰기 전 데모 백업이면 `list_purposes`가 5개). 앱으로 복원을 확인하려면 임시 일반 데이터 대상에 같은 가짜 데이터를 두고 확인해야 합니다. 실제 데이터의 복원은 일반 앱으로 확인합니다.

### 기입 기록

파일은 위 기입 기록 폴더의 **`writes-YYYY-MM.jsonl`**입니다. 각 줄에 `time`, `session`, `source`, `tool`, `input`, `ok`, `error`, `before`, `after`, `backup`을 저장합니다. 읽기와 서비스 호출 전의 입력 구조 오류는 기록하지 않습니다.

**도구 반환에서 메모를 숨겨도 기록의 입력·이전값·이후값에는 메모 원문이 보관될 수 있습니다.** DB·백업과 같은 개인 금융 자료로 취급하고 공개 저장소나 공개 첨부에 넣지 마세요. 기록 실패는 이미 성공한 기입을 되돌리지 않습니다. 응답의 `warning`과 표준 오류에 안내가 나오므로, 실패로 단정해 같은 쓰기를 반복하지 말고 읽기로 저장 결과를 먼저 확인하세요.

### 문제 해결

- **데이터 없음 (`no_database`)**: 먼저 앱을 한 번 실행하세요. 데모는 데이터 생성 뒤 등록해야 합니다. `--data`와 `--data-root`의 상위 폴더를 확인하세요. 데모가 없다고 실제 데이터로 자동 전환하지 않습니다.
- **DB 판 불일치 (`schema_mismatch`)**: 저장소를 최신으로 받아 `npm run build` 후 앱을 한 번 실행하고 다시 확인하세요. 서버는 마이그레이션하지 않습니다. DB를 직접 편집해 판을 맞추지 마세요.
- **데모 준비 실패**: 데모 재실행은 기존 DB를 초기화합니다. Windows에서 다른 앱·DB 도구가 파일을 열었거나 서버 조회가 계속 겹치면 초기화가 거절될 수 있습니다. 데모에 연결한 앱·서버·DB 도구를 종료하고 데모를 다시 실행한 뒤 연결하세요.
- **시작 실패**: `node --version`(22 이상, 확인 환경 24), 설치·빌드 완료 여부, `out\mcp\server.cjs`의 절대 경로와 인수를 확인하세요. `node`를 못 찾으면 Node 설치와 클라이언트의 PATH를 확인하고 클라이언트를 완전히 재시작하세요. JSON의 역슬래시는 `\\`, TOML의 작은따옴표 경로는 `\`를 사용합니다. `--check`의 출력과 종료 코드도 확인하세요.
- **쓰기 도구가 안 보임**: 읽기 전용은 8개가 정상입니다. 등록에 `--write`가 있는지, 재시작 후 상태의 `write=true`와 도구 24개를 확인하세요.
- **쓰기 잠금 (`busy`)**: 다른 기입이 길어지면 약 5초 기다린 뒤 거절할 수 있습니다. 다른 DB 작업이 끝난 뒤 읽기로 상태를 확인하고 재시도하세요.
- **백업 실패 (`backup_failed`)**: 백업 폴더가 파일로 막혔거나 쓰기 권한·디스크 공간에 문제가 없는지 확인하세요. 백업 실패 시 해당 쓰기는 저장되지 않습니다. 원인을 해결한 뒤 재시도하세요.
- **기입 기록 경고**: 저장은 성공했을 수 있습니다. 먼저 읽기로 결과를 확인한 뒤 기록 폴더의 권한·공간 문제를 해결하세요.

## AI 채팅창

앱 오른쪽의 **AI 대화**에서 계좌·카드·정기 흐름을 묻고, 확인 카드를 거쳐 기입할 수 있습니다. 지금은 **Claude Code로 대화하며 Codex는 준비 중**입니다. AI는 BeaverBank 도구로만 데이터를 보고 파일·명령·웹은 쓸 수 없습니다. 위 MCP 절의 클라이언트 등록과는 따로 동작합니다.

### 준비

1. Claude Code를 직접 설치하고, 터미널에서 `claude`를 실행해 로그인합니다. **2.1.284 이상**에서 확인했습니다.
2. Node 22 이상을 설치하고 저장소에서 `npm install`, `npm run build`를 실행합니다.

앱은 설치·로그인·업데이트를 대신하지 않습니다. `claude`는 PATH에서 먼저 찾고, 없으면 `%USERPROFILE%\.local\bin\claude.exe`를 씁니다. 공식 설치판 `claude.exe`를 권장합니다. `.cmd`·`.bat`는 `@echo off`와 고정된 Node 호출 한 줄로 된 파일만 지원합니다.

### 열기

사이드바의 **AI 대화** 단추나 **Ctrl+L**로 열고 닫습니다. 창 너비가 1280px 이상이면 패널이 오른쪽에 320~400px로 붙고 페이지가 그만큼 좁아집니다. 그보다 좁은 창에서는 320px 패널이 페이지 위를 덮습니다. 패널을 닫아도 답은 계속 받고, 다시 열면 대화와 입력 중인 글이 그대로입니다. 앱을 다시 시작하면 대화는 비어 있습니다.

### 모델

**기본·Opus·Sonnet·Haiku** 중에서 고릅니다. 기본은 Claude Code의 기본 모델이고, Opus·Sonnet·Haiku를 고르면 Claude Code 설정의 모델보다 이 선택을 씁니다. 바꾼 모델은 다음 메시지부터 쓰이며 대화는 이어집니다. 사용자의 훅·플러그인·다른 MCP 등록과 작업 폴더의 프로젝트 설정은 채팅에 쓰지 않습니다.

### 데이터와 기입

앱을 켤 때마다 **데모 데이터·기입 꺼짐**으로 시작합니다. 데모 실행에서는 데모 데이터만 고를 수 있습니다. 일반 실행에서 실제 데이터를 고르면 전송 범위 안내와 확인 팝업이 먼저 나오고, 실제 데이터에 기입을 허용할 때도 따로 확인합니다.

기입을 켜도 **기입 하나마다 확인 카드**에서 내용을 보고 ‘넣기’나 ‘거절’을 눌러야 합니다. 5분 안에 고르지 않으면 넣지 않습니다. 자동 백업과 기입 기록은 위 MCP 절과 같고, 채팅창은 **기입이 있는 답마다 첫 기입 직전에 백업을 하나** 만들어 **최근 20개**만 남깁니다.

### 사용량과 개인 정보

채팅창은 이 PC에 로그인된 Claude Code 계정으로 대화합니다. 보낸 메시지와 AI가 읽은 데이터만큼 그 계정의 사용량(요금제 한도 또는 API 요금)을 씁니다.

AI가 BeaverBank 도구로 읽은 계좌·카드 이름, 금융기관, 끝자리, 금액·잔액, 날짜, 정기 흐름과 채팅창에 입력한 글은 Anthropic(Claude)의 서버로 전송됩니다. 전송된 뒤의 보관·사용은 그 서비스의 약관과 설정을 따르며 BeaverBank가 통제할 수 없습니다. 도구 결과에 메모 내용은 넣지 않습니다. BeaverBank는 대화를 저장하지 않지만, Claude Code는 이 대화를 이 PC의 사용자 폴더(`%USERPROFILE%\.claude\projects\`) 아래에 자기 세션 기록으로 남깁니다. BeaverBank는 그 기록을 읽거나 지우지 않습니다.

`CLAUDE_CONFIG_DIR`를 정해 두었다면 세션 기록은 그 폴더의 `projects` 아래에 남습니다.

외부 요청을 막으려고 앱 전체의 맞춤법 검사를 꺼 두었습니다. 켜 두면 Chromium이 바깥 서버에서 한국어 사전을 내려받기 때문입니다.

### 문제 해결

- **없음**: Claude Code 설치와 PATH를 확인하세요. `.cmd`·`.bat`라면 위 준비의 지원 형식이 아닐 수 있으니 공식 설치판을 쓰세요. 그다음 ‘다시 확인’을 누릅니다.
- **로그인 필요**: 터미널에서 `claude`로 로그인한 뒤 ‘다시 확인’을 누르세요. 앱은 브라우저나 로그인 명령을 실행하지 않습니다.
- **검증되지 않은 판**: 2.1.284보다 낮거나 판을 알 수 없을 때 나옵니다. 대화는 막지 않고 도구 격리 검사도 그대로 하지만, 업데이트를 권장합니다.
- **허용되지 않은 도구로 멈춤**: BeaverBank 밖의 도구가 보이거나 실행 순서가 맞지 않아 답을 멈춘 상태입니다. Claude Code의 판과 설정을 확인한 뒤 다시 시도하세요.
- **데모 데이터 없음**: 데모 앱을 한 번 실행해 가짜 데이터를 준비한 뒤 다시 시도하세요. 실제 데이터로 저절로 바꾸지 않습니다.
- **서버가 빌드되지 않음**: 저장소에서 `npm run build`를 실행한 뒤 앱을 다시 시작하세요. `out\mcp\server.cjs`와 `out\mcp\chat-gate.cjs`가 모두 있어야 합니다.
- **Node 없음**: Node 22 이상을 설치하고 PATH를 확인한 뒤 앱을 다시 실행하세요.

## 로드맵

- [x] 0단계: 저장소 구성
- [x] 1단계: 프로젝트 뼈대, DB 테이블
- [x] 2단계: 용도·계좌·결제 카드 관리와 관계 그래프
- [x] 3단계: 정기 흐름, 회차 예외 처리
- [x] 4단계: 잔액 자동 계산과 보정
- [x] 5단계: 대시보드
- [x] 6단계: 그래픽 효과
- [ ] 7단계: 바탕화면 반투명 위젯
- [x] AI 연동: MCP 읽기·쓰기 서버와 앱 화면 자동 반영
- [x] AI 채팅창: Claude Code 대화·기입 확인·모델 선택·붙음/덮음 배치 (Codex 준비 중)
- [ ] 이후: 파티클과 3D 효과

## 라이선스

[MIT](./LICENSE)

화면 글꼴은 Pretendard(오픈 폰트 라이선스), 선 아이콘은 Lucide(ISC 라이선스), 그래프 배치는 d3-force(ISC 라이선스), 차트는 ECharts(Apache-2.0 라이선스), MCP SDK(`@modelcontextprotocol/server`)는 Apache-2.0 라이선스, 입력 검증은 Zod(MIT 라이선스)를 사용합니다. 글꼴·아이콘 라이선스 전문은 `licenses/`에 있고, d3-force·ECharts·MCP SDK·Zod 라이선스는 각 npm 패키지에 포함됩니다. 비버 일러스트는 이 프로젝트를 위해 제작했습니다.
