# 💬 사지방 메신저 (Simple Web Messenger)

사지방(군대 컴퓨터방)이나 모바일 기기 사용이 제한된 환경에서도 **2차 인증(휴대폰 번호 인증, OTP 등) 없이 닉네임 설정만으로 즉시 소통**할 수 있는 웹 기반 실시간 메신저입니다.

본 저장소는 서버가 필요 없는 정적 페이지(Static Web Page)로 구성되어 있어, **GitHub Pages**에 단 1분 만에 무료로 배포하여 사용할 수 있습니다.

---

## 주요 기능
- **간편한 입장**: 회원 가입이나 로그인 없이 닉네임만 입력하면 대화방에 즉시 들어갈 수 있습니다.
- **방 생성 및 공유**: 주소창의 파라미터(예: `?room=secret123`)를 이용해 즉석에서 새로운 대화방을 만들고, 상단 "초대 링크 복사" 버튼으로 링크만 공유하면 같은 방에서 대화할 수 있습니다.
- **최근 대화방 목록**: 이전에 참여했던 방 목록을 사이드바에서 쉽게 확인하고 원클릭으로 전환할 수 있습니다.
- **모바일 지원**: 반응형 디자인을 적용하여 데스크톱은 물론 모바일 브라우저에서도 최적화된 화면을 보여줍니다.
- **오프라인 데스크톱 데모 지원**: 데이터베이스를 연동하지 않아도 브라우저 탭 간에 `BroadcastChannel`을 사용하여 실시간으로 대화를 테스트해 볼 수 있습니다.

---

## 🚀 GitHub Pages 배포 방법 (초간단 배포)

1. 이 저장소(Repository)를 본인의 GitHub 계정으로 **Fork**하거나 새 리포지토리로 업로드합니다.
2. GitHub Repository 페이지에서 **Settings (설정)** 메뉴로 이동합니다.
3. 왼쪽 메뉴에서 **Pages**를 클릭합니다.
4. **Build and deployment** 섹션의 Source에서 `Deploy from a branch`를 선택합니다.
5. Branch를 `main` (또는 `master`) 브라우저로 선택하고 `/root` 폴더로 지정한 뒤 **Save**를 클릭합니다.
6. 약 1~2분 뒤 상단에 배포 완료 링크(`https://<본인아이디>.github.io/messenger/`)가 나타납니다.

---

## ⚙️ 데이터베이스(Firebase) 연동 방법

배포 후 모든 환경에서 실시간으로 대화를 송수신하려면 **Google Firebase** 데이터베이스를 무료로 연동해야 합니다.

### 1단계: Firebase 프로젝트 만들기
1. [Firebase 콘솔](https://console.firebase.google.com/)에 구글 로그인 후 **프로젝트 추가**를 누릅니다.
2. 프로젝트 이름을 설정하고 생성합니다. (Google 애널리틱스는 사용하지 않아도 됩니다.)

### 2단계: 웹 앱 등록 및 설정값 복사
1. 프로젝트 홈 화면 중앙의 **웹(Web) 아이콘 `</>`**을 클릭합니다.
2. 앱 닉네임을 설정하고 앱을 등록합니다.
3. 생성된 `firebaseConfig` 객체 안의 설정 내용들을 복사합니다.

### 3단계: Cloud Firestore 데이터베이스 만들기
1. Firebase 콘솔 왼쪽 메뉴에서 **Firestore Database**를 클릭합니다.
2. **데이터베이스 만들기** 버튼을 클릭합니다.
3. 위치 설정 후 **테스트 모드로 시작**을 선택하여 데이터베이스를 만듭니다. (또는 대화방 보안 규칙을 수정하고 싶다면 규칙 설정을 조정하세요.)
4. **규칙(Rules)** 탭으로 이동하여 외부 누구나 메시지를 읽고 쓸 수 있도록 설정을 확인합니다. (기본 테스트 모드 규칙은 30일 동안 누구나 접근 가능하도록 허용합니다.)
   ```javascript
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if true;
       }
     }
   }
   ```

### 4단계: 메신저 웹앱에 설정 적용하기

설정값을 적용하는 방법은 두 가지가 있습니다.

#### 방법 A. 웹 UI에서 직접 입력 (추천 - 소스코드에 API 키 노출 안 됨)
1. 배포된 메신저 페이지에 접속합니다.
2. 사이드바 하단의 **연동 설정** 버튼을 누릅니다.
3. 2단계에서 복사한 Firebase 설정을 칸에 맞게 입력한 후 **저장 및 연결**을 누릅니다.
4. 브라우저 `localStorage`에 설정이 저장되며 온라인 실시간 모드가 활성화됩니다.

#### 방법 B. 소스코드 파일 수정
1. 프로젝트 폴더 내 `config.js` 파일을 엽니다.
2. 복사한 Firebase 설정값들을 입력합니다.
   ```javascript
   export const firebaseConfig = {
     apiKey: "본인의 API Key",
     authDomain: "본인의 Auth Domain",
     projectId: "본인의 Project ID",
     storageBucket: "본인의 Storage Bucket",
     messagingSenderId: "본인의 Sender ID",
     appId: "본인의 App ID"
   };
   ```
3. 파일을 저장하고 GitHub에 Commit & Push 합니다. 이 방식을 사용하면 다른 사용자가 내 링크에 접속했을 때 설정 입력 없이 즉시 데이터베이스가 자동 연동됩니다.

---

## 🛠️ 로컬 개발 및 테스트
로컬 환경에서 코드를 테스트하려면 웹 서버를 실행하여 접속해야 합니다. (ES Module을 사용하므로 단순히 더블클릭해서 실행하면 CORS 오류가 발생할 수 있습니다.)

VS Code의 **Live Server** 확장 프로그램을 사용하여 `index.html`을 열거나, 터미널에서 다음 명령어를 통해 실행할 수 있습니다:
```bash
# Python이 설치되어 있는 경우
python -m http.server 8000

# Node.js가 설치되어 있는 경우
npx serve -l 8000
```
웹 브라우저에서 `http://localhost:8000`으로 접속하여 테스트하세요.
