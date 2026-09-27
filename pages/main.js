const password = document.getElementById("password");
const eye = document.getElementById("eye");
const loginForm = document.getElementById("loginForm");

function getActiveLoginUrl() {
  try {
    const backend =
      window.adminAuth && typeof window.adminAuth.getActiveBackend === "function"
        ? window.adminAuth.getActiveBackend()
        : null;
    if (backend && backend.url) return backend.url + "/functions/v1/admin-login";
  } catch (_e) {}
  return "https://msgqzgzoslearaprgiqq.supabase.co/functions/v1/admin-login";
}

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
    const response = await fetch(getActiveLoginUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", username: userInput, password: pwdInput }),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result?.success || !result?.token) {
      showInlineError(result?.error || "اسم المستخدم أو كلمة المرور غير صحيحة.");
      return;
    }

    if (window.adminAuth?.createSession) {
      window.adminAuth.createSession(result.username || userInput, result.token);
    }
    window.location.replace("shacksf.html");
  } catch (err) {
    console.error("Login error:", err);
    showInlineError("حدث خطأ في الاتصال بخادم تسجيل الدخول.");
  }
}

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearInlineError();
    await handleLogin();
  });
}