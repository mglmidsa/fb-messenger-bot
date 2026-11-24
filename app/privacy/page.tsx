export const metadata = { title: "Нууцлалын бодлого — Privacy Policy" };

const wrap: React.CSSProperties = {
  maxWidth: 680,
  margin: "0 auto",
  padding: "32px 16px 64px",
  fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  lineHeight: 1.6,
  color: "#1f2328",
};
const h2: React.CSSProperties = { fontSize: 18, marginTop: 28 };
const muted: React.CSSProperties = { color: "#59636e", fontSize: 14 };

export default function Privacy() {
  return (
    <main style={wrap}>
      <h1 style={{ fontSize: 26 }}>Нууцлалын бодлого</h1>
      <p style={muted}>Шинэчилсэн: 2026-11-24</p>
      <p>Энэхүү бодлого нь манай Facebook пэйжийн Messenger дахь автомат туслахад (AI бот) хамаарна.</p>

      <h2 style={h2}>Ямар мэдээлэл авдаг вэ</h2>
      <ul>
        <li>Таны Messenger-ээр бичсэн мессежүүд.</li>
        <li>Таны сонирхож буй тусгай зөвшөөрлийн чиглэл.</li>
        <li>Таны өөрөө үлдээсэн утасны дугаар.</li>
      </ul>
      <p>Бид нэр, регистр, хаяг, имэйл, төлбөрийн мэдээлэл асуудаггүй.</p>

      <h2 style={h2}>Ямар зорилгоор ашигладаг вэ</h2>
      <p>
        Утасны дугаарыг зөвхөн манай ажилтан тантай холбогдож, тусгай зөвшөөрлийн талаар ярилцахад ашиглана. Зар
        сурталчилгаанд ашиглахгүй, бусдад худалдахгүй.
      </p>

      <h2 style={h2}>Хэнд дамжуулдаг вэ</h2>
      <ul>
        <li>Манай ажилтнууд: утасны дугаар, сонирхож буй чиглэл манай байгууллагын дотоод Telegram чат руу илгээгдэнэ.</li>
        <li>
          Үйлчилгээ ажиллуулахад ашигладаг үйлчилгээ үзүүлэгчид: Meta (Messenger), Anthropic (Claude AI хариултыг
          боловсруулна), Vercel (сервер), Upstash (түр хадгалах сан), Telegram (ажилтанд мэдэгдэл хүргэнэ). Эдгээрт
          тэдний өөрсдийн үйлчилгээний нөхцөл үйлчилнэ.
        </li>
      </ul>

      <h2 style={h2}>Хэр удаан хадгалдаг вэ</h2>
      <ul>
        <li>
          Ажилтанд хараахан хүрээгүй хүсэлт манай хадгалах санд хамгийн ихдээ 30 хоног хадгалагдана. Ажилтанд хүрсэн
          даруйд утасны дугаар хадгалах сангаас устгагдана.
        </li>
        <li>
          Нэг хүсэлтийг давхар бүртгэхгүйн тулд утасны дугаарыг агуулаагүй, буцааж тайлах боломжгүй тэмдэглэгээ (hash)
          30 хоног хадгалагдана.
        </li>
        <li>Ажилтанд илгээсэн мэдэгдэл манай дотоод Telegram чатад үлдэнэ.</li>
        <li>Messenger дээрх ярианы түүх Facebook-ийн дүрмийн дагуу Facebook-д хадгалагдана.</li>
      </ul>

      <h2 style={h2}>AI туслах</h2>
      <p>
        Энэ пэйжийн автомат хариултыг AI туслах бичдэг. Тусгай зөвшөөрлийн шаардлага, үнэ, хугацааны талаарх мэдээллийг
        зөвхөн манай ажилтан утсаар өгнө.
      </p>

      <h2 style={h2} id="delete">
        Мэдээллээ устгуулах
      </h2>
      <p>
        Пэйж рүү Messenger-ээр «Миний мэдээллийг устгана уу» гэж бичнэ үү. Хүсэлт тань манай ажилтанд шууд очиж, таны
        утасны дугаар болон холбогдох мэдэгдлийг устгана.
      </p>

      <h2 style={h2}>Холбоо барих</h2>
      <p>Энэ пэйжийн Messenger-ээр бидэнтэй холбогдоно уу.</p>

      <hr style={{ margin: "40px 0", border: 0, borderTop: "1px solid #d1d9e0" }} />

      <h1 style={{ fontSize: 22 }} lang="en">
        Privacy Policy
      </h1>
      <div lang="en">
        <p>This policy covers the automated assistant (AI bot) in our Facebook Page&apos;s Messenger.</p>
        <p>
          <strong>What we collect:</strong> the messages you send, the licence type you are interested in, and the phone
          number you choose to leave. We do not ask for your name, ID number, address, email or payment details.
        </p>
        <p>
          <strong>Why:</strong> your phone number is used only so our staff can call you about your licence enquiry. It
          is not used for advertising and is not sold.
        </p>
        <p>
          <strong>Who receives it:</strong> our staff, through an internal Telegram chat; and the providers that run the
          service: Meta (Messenger), Anthropic (Claude AI writes replies), Vercel (hosting), Upstash (temporary storage)
          and Telegram (staff notifications), each under its own terms.
        </p>
        <p>
          <strong>Retention:</strong> an undelivered request is kept for at most 30 days and the phone number is deleted
          from our storage as soon as it reaches staff. A one-way hash (without the phone number) is kept for 30 days to
          prevent duplicate requests. Notifications remain in our internal Telegram chat. Messenger history is kept by
          Facebook under its own rules.
        </p>
        <p id="delete-en">
          <strong>Data deletion:</strong> message the Page &quot;Please delete my data&quot;. The request goes straight
          to our staff, who will delete your phone number and related notifications.
        </p>
        <p>
          <strong>Contact:</strong> message this Page on Messenger.
        </p>
      </div>
    </main>
  );
}
