const password = document.getElementById("password");
const eye = document.getElementById("eye");
const loginForm = document.getElementById("loginForm");

const USER_HASH = "ab19f86f9ee97ec5ccbeb7e71910daaf7b69fd47d14092a042b36556a214b241";
const PASS_HASH = "bbba5bf96cc103d98a39783064a00fbd56335dbfb36419e0870eb8e6a5ec1ea6";
const HASH_SALT = "boda-admin";

function showInlineError(message) {
  let alertNode = document.getElementById("loginError");
  if (!alertNode) {
    alertNode = document.createElement("p");
    alertNode.id = "loginError";
    alertNode.style.cssText = "color:#b42318;font-weight:700;font-size:13px;margin:6px 0 0;";
    loginForm.appendChild(alertNode);
  }
  alertNode.textContent = message;
}

function clearInlineError() {
  const alertNode = document.getElementById("loginError");
  if (alertNode) {
    alertNode.textContent = "";
  }
}

async function sha256(value) {
  const encoded = new TextEncoder().encode(value);
  const hash = await window.crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hash))
    .map((part) => part.toString(16).padStart(2, "0"))
    .join("");
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

  const [enteredUserHash, enteredPassHash] = await Promise.all([
    sha256(`u|${userInput}|${HASH_SALT}`),
    sha256(`p|${pwdInput}|${HASH_SALT}`),
  ]);

  if (enteredUserHash === USER_HASH && enteredPassHash === PASS_HASH) {
    if (window.adminAuth?.createSession) {
      window.adminAuth.createSession();
    }
    window.location.replace("shacksf.html");
    return;
  }

  showInlineError("اسم المستخدم أو كلمة المرور غير صحيحة.");
}

if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearInlineError();
    await handleLogin();
  });
}
