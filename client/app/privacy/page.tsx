import type { Metadata } from "next";
import PageShell from "@/components/layout/PageShell";
import { CONTACT_EMAIL, POLICY_UPDATED_AT, SITE_NAME } from "@/lib/site-meta";

export const metadata: Metadata = {
  title: "개인정보처리방침 | 로모아",
  description:
    "로모아가 수집하는 정보, 이용 목적, 쿠키 및 광고 관련 정책과 이용자의 권리를 안내합니다.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <PageShell title="개인정보처리방침" updatedAt={POLICY_UPDATED_AT}>
      <p>
        {SITE_NAME}(이하 &ldquo;사이트&rdquo;)는 이용자의 개인정보를 소중히
        생각하며, 관련 법령에 따라 개인정보를 보호하기 위해 노력합니다. 본
        방침은 사이트가 어떤 정보를 수집하고 어떻게 이용하는지를 설명합니다.
      </p>

      <h2>1. 회원가입 및 직접 식별정보 수집 여부</h2>
      <p>
        사이트는 <strong>회원가입 기능을 제공하지 않습니다.</strong> 따라서
        이름, 생년월일, 전화번호, 이메일 주소, 주소 등 이용자를 직접 식별할 수
        있는 개인정보를 수집하거나 저장하지 않습니다.
      </p>
      <p>
        다만 서비스 운영과 개선을 위해 아래와 같은 접속 정보 및 이용 기록이
        자동으로 수집됩니다.
      </p>

      <h2>2. 자동으로 수집되는 정보</h2>
      <div className="doc-table-wrap">
        <table>
          <thead>
            <tr>
              <th>구분</th>
              <th>수집 항목</th>
              <th>목적</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>방문 기록</td>
              <td>
                접속 페이지 경로, 기기 유형(모바일·태블릿·데스크톱), 브라우저
                정보(User-Agent), 유입 경로(Referrer), 브라우저 언어 기준
                국가코드
              </td>
              <td>이용 현황 파악 및 서비스 개선</td>
            </tr>
            <tr>
              <td>성능 기록</td>
              <td>페이지 로딩 시간 등 응답 속도 지표</td>
              <td>속도 저하 구간 진단 및 개선</td>
            </tr>
            <tr>
              <td>오류 기록</td>
              <td>오류 발생 시 오류 메시지, 발생 위치, 브라우저 환경 정보</td>
              <td>장애 원인 파악 및 수정</td>
            </tr>
            <tr>
              <td>피드백</td>
              <td>
                이용자가 직접 작성한 메시지 내용, 작성 시점의 페이지 경로, 기기
                유형, 방문 일수·방문 횟수·최초 방문일
              </td>
              <td>의견 확인 및 서비스 개선</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>IP 주소에 대하여</h3>
      <p>
        피드백 전송 시 도배 방지(전송 횟수 제한)를 위해 접속 IP 주소를
        일시적으로 사용합니다. 이 값은{" "}
        <strong>서버 메모리에서만 사용되며 데이터베이스에 저장되지 않고</strong>
        , 서버 재시작 시 소멸합니다. 피드백은 익명으로 처리되어 작성자를 특정할
        수 없습니다.
      </p>

      <h3>브라우저에만 저장되는 정보</h3>
      <p>
        아래 항목은 이용자의 브라우저 저장소(localStorage)에만 보관되며 서버로
        전송되지 않습니다. 브라우저 설정에서 사이트 데이터를 삭제하면 즉시
        사라집니다.
      </p>
      <ul>
        <li>다크 모드 설정값</li>
        <li>즐겨찾기한 사이트 및 사용자가 만든 목록(프리셋), 정렬 순서</li>
        <li>
          방문 횟수 카운터 — 식별자를 생성하지 않으며, 피드백 전송 시에만 &ldquo;몇 일,
          몇 번 방문했는지&rdquo;의 요약만 함께 전달됩니다
        </li>
      </ul>

      <h2>3. 쿠키 및 유사 기술</h2>
      <p>
        사이트는 방문 분석과 광고 게재를 위해 쿠키를 사용합니다. 이용자는
        브라우저 설정을 통해 쿠키 저장을 거부할 수 있으나, 이 경우 일부 기능이
        정상적으로 동작하지 않을 수 있습니다.
      </p>

      <h3>Google Analytics</h3>
      <p>
        사이트는 Google LLC의 Google Analytics를 사용하여 방문 통계를 분석합니다.
        Google Analytics는 쿠키를 통해 익명화된 이용 정보를 수집합니다. 이용자는{" "}
        <a
          href="https://tools.google.com/dlpage/gaoptout"
          target="_blank"
          rel="noopener noreferrer"
        >
          Google Analytics 차단 브라우저 부가기능
        </a>
        을 설치하여 수집을 거부할 수 있습니다.
      </p>

      <h3>Google AdSense 및 광고 쿠키</h3>
      <p>
        사이트는 Google AdSense를 통한 광고를 게재합니다(게재 준비 중인 기간을
        포함합니다). 광고 게재와 관련하여 다음 사항을 안내드립니다.
      </p>
      <ul>
        <li>
          Google을 포함한 제3자 공급업체는 쿠키를 사용하여 이용자의 이전 방문
          기록에 기반한 광고를 게재합니다.
        </li>
        <li>
          Google이 광고 쿠키를 사용함에 따라, Google과 그 파트너는 이용자가
          사이트 또는 다른 웹사이트를 방문한 기록을 바탕으로 광고를 게재할 수
          있습니다.
        </li>
        <li>
          이용자는{" "}
          <a
            href="https://www.google.com/settings/ads"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google 광고 설정
          </a>
          에서 맞춤 광고를 사용 중지할 수 있습니다.
        </li>
        <li>
          제3자 공급업체의 쿠키 사용은{" "}
          <a
            href="https://www.aboutads.info/choices/"
            target="_blank"
            rel="noopener noreferrer"
          >
            www.aboutads.info
          </a>
          에서 개별적으로 거부할 수 있습니다.
        </li>
      </ul>

      <h2>4. 개인정보의 처리 위탁 및 제3자 제공</h2>
      <p>
        사이트는 이용자의 정보를 판매하거나 마케팅 목적으로 제3자에게 제공하지
        않습니다. 다만 서비스 운영을 위해 아래 사업자의 서비스를 이용하며, 이
        과정에서 접속 정보가 해당 사업자에게 전달될 수 있습니다.
      </p>
      <div className="doc-table-wrap">
        <table>
          <thead>
            <tr>
              <th>사업자</th>
              <th>이용 목적</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Google LLC</td>
              <td>방문 통계 분석(Google Analytics), 광고 게재(AdSense)</td>
            </tr>
            <tr>
              <td>Vercel Inc.</td>
              <td>웹사이트 호스팅 및 콘텐츠 전송</td>
            </tr>
            <tr>
              <td>Amazon Web Services, Inc.</td>
              <td>API 서버 및 데이터베이스 운영(서울 리전)</td>
            </tr>
            <tr>
              <td>Functional Software, Inc. (Sentry)</td>
              <td>오류 및 장애 추적</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        위 사업자 중 일부는 국외에 서버를 두고 있어 정보가 국외로 이전될 수
        있습니다. 이전되는 항목은 위 &ldquo;2. 자동으로 수집되는 정보&rdquo;에 기재된
        범위에 한정됩니다.
      </p>
      <p>
        이 외에 법령에 따라 수사기관 등이 적법한 절차에 의해 요청하는 경우에는
        관련 법령이 정하는 범위에서 협조할 수 있습니다.
      </p>

      <h2>5. 보유 및 이용 기간</h2>
      <ul>
        <li>
          방문·성능·오류 기록: 서비스 개선 및 통계 목적으로 보관하며, 목적 달성
          후 지체 없이 파기합니다.
        </li>
        <li>
          피드백 내용: 확인 및 개선 반영 후 보관하며, 삭제 요청 시 지체 없이
          삭제합니다.
        </li>
        <li>
          IP 주소: 저장하지 않으며, 도배 방지 목적의 일시적 메모리 사용 후
          소멸합니다.
        </li>
      </ul>

      <h2>6. 이용자의 권리와 행사 방법</h2>
      <p>
        사이트는 회원가입을 받지 않아 이용자를 특정할 수 있는 정보를 보유하고
        있지 않으므로, 개인 단위의 열람·정정 요청에는 응하기 어려울 수 있습니다.
        다만 다음과 같은 방법으로 권리를 행사하실 수 있습니다.
      </p>
      <ul>
        <li>
          쿠키 및 광고 수집 거부: 위 &ldquo;3. 쿠키 및 유사 기술&rdquo;의 각 링크를
          이용해 주세요.
        </li>
        <li>
          브라우저에 저장된 설정 삭제: 브라우저의 사이트 데이터 삭제 기능을
          이용하시면 즉시 삭제됩니다.
        </li>
        <li>
          본인이 작성한 피드백 삭제: 작성 시점과 내용을 알려주시면 확인 후
          삭제해 드립니다. 아래 연락처로 요청해 주세요.
        </li>
      </ul>

      <h2>7. 아동의 개인정보</h2>
      <p>
        사이트는 만 14세 미만 아동을 대상으로 하지 않으며, 아동의 개인정보를
        고의로 수집하지 않습니다.
      </p>

      <h2>8. 개인정보 보호책임자 및 문의처</h2>
      <p>
        개인정보 처리에 관한 문의, 불만 처리, 피해 구제 등에 관한 사항은 아래로
        연락해 주시기 바랍니다.
      </p>
      <ul>
        <li>개인정보 보호책임자: {SITE_NAME} 운영자</li>
        <li>
          이메일: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </li>
      </ul>
      <p>
        개인정보 침해에 대한 신고나 상담이 필요하신 경우 개인정보침해
        신고센터(국번 없이 118), 대검찰청 사이버수사과(1301), 경찰청
        사이버수사국(182) 등에 문의하실 수 있습니다.
      </p>

      <h2>9. 방침의 변경</h2>
      <p>
        본 개인정보처리방침의 내용이 추가·삭제·수정되는 경우, 변경 사항을 본
        페이지에 게시하고 최종 수정일을 갱신합니다.
      </p>
      <p>본 방침은 {POLICY_UPDATED_AT}부터 적용됩니다.</p>
    </PageShell>
  );
}
