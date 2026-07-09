const password = document.getElementById("password");
const eye = document.getElementById("eye");
const loginForm = document.getElementById("loginForm");

const SUPABASE_URL = "https://msgqzgzoslearaprgiqq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ3F6Z3pvc2xlYXJhcHJnaXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzk3MTIsImV4cCI6MjA4NTkxNTcxMn0.fQu1toCisGIly8FZqHy3yoEwnY-e7vthk8PCmkBMifE";

if (typeof supabase === "undefined") {
  console.error("Supabase library not loaded. Check network/script.");
}
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function showInlineError(message) {
  let alertNode = document.getElementById("loginError");
  if (!alertNode) {
    alertNode = document.createElement("p");
    alertNode.id = "loginError";
    alertNode.className = "login-error";
    loginForm.appendChild(alertNode);
  }
  alertNode.textContent = message;
  alertNode.classList.add("visible");
}

function clearInlineError() {
  const alertNode = document.getElementById("loginError");
  if (alertNode) {
    alertNode.textContent = "";
    alertNode.classList.remove("visible");
  }
}

if (eye) {
  eye.addEventListener("click", () => {
    const icon = eye.querySelector("i");
    const show = password.type === "password";
    password.type = show ? "text" : "password";
    if (icon) {
      icon.classList.toggle("fa-eye", !show);
      icon.classList.toggle("fa-eye-slash", show);
    }
  });
}

async function handleLogin() {
  const userInput = document.getElementById("username").value.trim();
  const pwdInput = password.value.trim();

  if (!userInput || !pwdInput) {
    showInlineError("يرجى إدخال اسم المستخدم وكلمة المرور.");
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from("admin_users")
      .select("id, username, password")
      .eq("username", userInput)
      .limit(1);

    if (error) throw error;

    if (!data || data.length === 0) {
      showInlineError("اسم المستخدم أو كلمة المرور غير صحيحة.");
      return;
    }

    const user = data[0];
    if (pwdInput !== user.password) {
      showInlineError("اسم المستخدم أو كلمة المرور غير صحيحة.");
      return;
    }

    if (window.adminAuth?.createSession) {
      window.adminAuth.createSession(user.username);
    }
    window.location.replace("shacksf.html");
  } catch (err) {
    console.error("Login error:", err);
    showInlineError("حدث خطأ في الاتصال بقاعدة البيانات.");
  }
}

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearInlineError();
    await handleLogin();
  });
}
