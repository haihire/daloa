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

      <h2>1. 사이트의 구조와 수집 원칙</h2>
      <p>
        사이트는{" "}
        <strong>
          회원가입 기능이 없고, 자체 서버나 데이터베이스를 운영하지 않는 정적
          웹사이트
        </strong>
        입니다. 모든 페이지는 미리 만들어진 파일로 제공되며, 사이트가 이용자의
        정보를 직접 받아 저장하는 기능은 없습니다.
      </p>
      <p>
        따라서 이름, 생년월일, 전화번호, 이메일 주소, 주소, IP 주소 등 이용자를
        식별할 수 있는 개인정보를{" "}
        <strong>사이트가 직접 수집하거나 보관하는 일은 없습니다.</strong> 다만
        아래에 안내하는 외부 서비스가 각자의 정책에 따라 방문 정보를 수집할 수
        있습니다.
      </p>

      <h2>2. 외부 서비스를 통해 수집되는 정보</h2>
      <div className="doc-table-wrap">
        <table>
          <thead>
            <tr>
              <th>서비스</th>
              <th>수집 주체</th>
              <th>목적 및 항목</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Google Analytics</td>
              <td>Google LLC</td>
              <td>
                방문 통계 분석. 쿠키를 통해 방문 페이지, 기기 및 브라우저 정보,
                유입 경로, 대략적인 지역 정보 등이 수집됩니다.
              </td>
            </tr>
            <tr>
              <td>Google AdSense</td>
              <td>Google LLC</td>
              <td>
                광고 게재. 광고 쿠키를 통해 이용자의 방문 기록 기반 정보가
                처리될 수 있습니다.
              </td>
            </tr>
            <tr>
              <td>Cloudflare</td>
              <td>Cloudflare, Inc.</td>
              <td>
                웹사이트 호스팅 및 콘텐츠 전송. 서비스 제공 과정에서 접속 로그가
                처리될 수 있습니다.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        위 사업자는 국외에 서버를 두고 있어 정보가 국외로 이전될 수 있습니다. 각
        서비스의 상세한 처리 내용은 해당 사업자의 개인정보처리방침을 따릅니다.
      </p>

      <h3>브라우저에만 저장되는 정보</h3>
      <p>
        아래 항목은 이용자의 브라우저 저장소(localStorage)에만 보관되며 어디로도
        전송되지 않습니다. 브라우저 설정에서 사이트 데이터를 삭제하면 즉시
        사라집니다.
      </p>
      <ul>
        <li>다크 모드 설정값</li>
        <li>즐겨찾기한 사이트 및 사용자가 만든 목록(프리셋), 정렬 순서</li>
      </ul>

      <h2>3. 쿠키 및 유사 기술</h2>
      <p>
        사이트는 방문 분석과 광고 게재를 위해 쿠키를 사용합니다. 이용자는
        브라우저 설정을 통해 쿠키 저장을 거부할 수 있으나, 이 경우 일부 기능이
        정상적으로 동작하지 않을 수 있습니다.
      </p>

      <h3>Google Analytics</h3>
      <p>
        사이트는 Google LLC의 Google Analytics를 사용하여 방문 통계를
        분석합니다. 이용자는{" "}
        <a
          href="https://tools.google.com/dlpage/gaoptout"
          target="_blank"
          rel="noopener noreferrer"
        >
          Google Analytics 차단 브라우저 부가기능
        </a>
        을 설치하여 수집을 거부할 수 있습니다.
      </p>

      <h3>광고 쿠키</h3>
      <p>사이트에 광고가 게재되는 경우 다음 사항이 적용됩니다.</p>
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

      <h2>4. 개인정보의 제3자 제공</h2>
      <p>
        사이트는 이용자의 정보를 판매하거나 마케팅 목적으로 제3자에게 제공하지
        않습니다. 사이트가 보관하는 정보 자체가 없으므로 제공할 정보도 없습니다.
        위 &ldquo;2. 외부 서비스를 통해 수집되는 정보&rdquo;에 기재된 사업자가
        각자의 방침에 따라 정보를 처리하는 것이 전부입니다.
      </p>
      <p>
        법령에 따라 수사기관 등이 적법한 절차에 의해 요청하는 경우에는 관련
        법령이 정하는 범위에서 협조할 수 있습니다.
      </p>

      <h2>5. 보유 및 이용 기간</h2>
      <p>
        사이트는 이용자의 정보를 자체적으로 보유하지 않습니다. 외부 서비스가
        수집한 정보의 보유 기간은 각 사업자의 정책을 따릅니다.
      </p>

      <h2>6. 이용자의 권리와 행사 방법</h2>
      <p>
        사이트는 이용자를 특정할 수 있는 정보를 보유하고 있지 않으므로, 개인
        단위의 열람·정정 요청에는 응하기 어렵습니다. 다만 다음과 같은 방법으로
        권리를 행사하실 수 있습니다.
      </p>
      <ul>
        <li>
          쿠키 및 광고 수집 거부: 위 &ldquo;3. 쿠키 및 유사 기술&rdquo;의 각
          링크를 이용해 주세요.
        </li>
        <li>
          브라우저에 저장된 설정 삭제: 브라우저의 사이트 데이터 삭제 기능을
          이용하시면 즉시 삭제됩니다.
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
