// Konfigurasi Firebase kamu
const firebaseConfig = {
    apiKey: "AIzaSyB5Bv9O9Qpq1pB99vVuZrm9uluZxiKbM98",
    authDomain: "livechat-web127.firebaseapp.com",
    databaseURL: "https://livechat-web127-default-rtdb.firebaseio.com",
    projectId: "livechat-web127",
    storageBucket: "livechat-web127.firebasestorage.app",
    messagingSenderId: "221861682578",
    appId: "1:221861682578:web:a9671d0c34217d590a354b",
    measurementId: "G-HEQ3GFGJD5",
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

let currentUserEmail = null;
let activeChatId = null;

// Pengecekan login saat halaman dimuat
auth.onAuthStateChanged((user) => {
    if (user) {
        currentUserEmail = user.email;
        showChat();
    } else {
        $("#login-form").show();
        $("#chat-app").hide();
    }
});

function sanitizeEmail(email) {
    return email.replace(/\./g, "_dot_");
}

function generateChatId(user1, user2) {
    return [sanitizeEmail(user1), sanitizeEmail(user2)].sort().join("_");
}

function showChat() {
    if (!auth.currentUser) return;

    $("#login-form").hide();
    $("#chat-app").show();
    loadChatList();

    const $recipientList = $("#recipient-list");
    $recipientList.empty();
    const emailSet = new Set();

    db.ref("users").once("value", (snapshot) => {
        snapshot.forEach((child) => {
            const email = child.val().email;
            if (email !== currentUserEmail && !emailSet.has(email)) {
                emailSet.add(email);
                const chatId = generateChatId(currentUserEmail, email);

                db.ref(`chats/${chatId}`)
                    .orderByChild("user")
                    .equalTo(email)
                    .once("value", (chatSnap) => {
                        let unread = false;
                        chatSnap.forEach((msg) => {
                            const msgVal = msg.val();
                            if (!Array.isArray(msgVal.readBy) || !msgVal.readBy.includes(sanitizeEmail(currentUserEmail))) {
                                unread = true;
                            }
                        });

                        const $li = $("<li>")
                            .text(email + (unread ? " (belum dibaca)" : ""))
                            .attr("data-email", email)
                            .css({ cursor: "pointer", fontWeight: unread ? "bold" : "normal" });

                        $recipientList.append($li);
                    });
            }
        });
    });
}

$("#login-btn").on("click", () => {
    const userEmail = $("#email").val();
    const userPass = $("#password").val();

    if (!userEmail || !userPass) return alert("Isi email dan password!");
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
        .then(() => auth.signInWithEmailAndPassword(userEmail, userPass))
        .catch((err) => alert("Gagal login: " + err.message));
});

$("#register-btn").on("click", () => {
    const userEmail = $("#email").val();
    const userPass = $("#password").val();

    if (!userEmail || !userPass) return alert("Isi email dan password!");

    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
        .then(() => auth.createUserWithEmailAndPassword(userEmail, userPass))
        .then(() => db.ref("users").push({ email: userEmail }))
        .catch((err) => alert("Gagal daftar: " + err.message));
});

$("#logout-btn").on("click", () => {
    if (activeChatId) db.ref(`chats/${activeChatId}`).off();

    auth.signOut().then(() => {
        $("#login-form").show();
        $("#chat-app").hide();
        $("#chat-box, #chat-list, #recipient-list").empty();
        activeChatId = null;
        currentUserEmail = null;
    });
});

$("#recipient-list").on("click", "li", function () {
  $("#recipient-modal").css("display", "none");
    const recipient = $(this).data("email");
    if (!recipient || !auth.currentUser) return;

    activeChatId = generateChatId(currentUserEmail, recipient);
    $("#recipient-modal").addClass("hidden");

    loadChatConversation(recipient);
});

function loadChatConversation(recipient) {
    let lastMsgDate = null;
    $("#chat-box").html("");
    db.ref(`chats/${activeChatId}`).off();
    db.ref(`chats/${activeChatId}`).on("child_added", (data) => {
        const msg = data.val();
        const msgDate = new Date(msg.time);
        const msgDateStr = msgDate.toDateString();

        if (msgDateStr !== lastMsgDate) {
            lastMsgDate = msgDateStr;
            const $dateLabel = $("<div>").addClass("date-separator").text(formatDateLabel(msgDate));
            $("#chat-box").append($dateLabel);
        }

        const time = msgDate.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
        });

        const isRead = Array.isArray(msg.readBy) && msg.readBy.includes(sanitizeEmail(recipient));
        const readStatus = msg.user === currentUserEmail ? (isRead ? "✔✔" : "✔") : "";

        const $bubble = $("<div>")
            .addClass("bubble")
            .addClass(msg.user === currentUserEmail ? "me" : "them")
            .html(`<strong>${msg.text}</strong><br><small style="font-size: 0.7rem; color: gray;">${time} ${readStatus}</small>`);

        $("#chat-box").append($bubble);
        $("#chat-box")[0].scrollTop = $("#chat-box")[0].scrollHeight;
    });

    markMessagesAsRead(activeChatId);
}

$("#send-btn").on("click", () => {
    const text = $("#message").val();
    if (!text.trim() || !activeChatId) return;

    const msg = {
        user: currentUserEmail,
        text: text.trim(),
        time: Date.now(),
        readBy: [sanitizeEmail(currentUserEmail)],
    };

    db.ref(`chats/${activeChatId}`).push(msg);
    $("#message").val("");
});

function markMessagesAsRead(chatId) {
    if (!auth.currentUser) return;

    db.ref(`chats/${chatId}`).once("value", (snapshot) => {
        snapshot.forEach((child) => {
            const msgKey = child.key;
            const msg = child.val();
            const readBy = Array.isArray(msg.readBy) ? msg.readBy : [];

            if (!readBy.includes(sanitizeEmail(currentUserEmail))) {
                readBy.push(sanitizeEmail(currentUserEmail));
                db.ref(`chats/${chatId}/${msgKey}/readBy`).set(readBy);
            }
        });
    });
}

function formatDateLabel(date) {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const dateStr = date.toDateString();
    if (dateStr === today.toDateString()) return "Hari Ini";
    if (dateStr === yesterday.toDateString()) return "Kemarin";

    return date.toLocaleDateString("id-ID", {
        weekday: "long",
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
}

function loadChatList() {
    if (!auth.currentUser) return;

    const $chatList = $("#chat-list");
    $chatList.html("");

    db.ref("chats")
        .orderByKey()
        .once("value", (snapshot) => {
            const uniqueEmails = new Set();
            let hasChat = false;

            snapshot.forEach((child) => {
                const chatId = child.key;
                if (chatId.includes(sanitizeEmail(currentUserEmail))) {
                    const emails = chatId.split("_");
                    const unsanitizedEmail1 = emails
                        .slice(0, emails.length / 2)
                        .join("_")
                        .replace(/_dot_/g, ".");
                    const unsanitizedEmail2 = emails
                        .slice(emails.length / 2)
                        .join("_")
                        .replace(/_dot_/g, ".");
                    const otherUser = unsanitizedEmail1 === currentUserEmail ? unsanitizedEmail2 : unsanitizedEmail1;

                    if (otherUser && !uniqueEmails.has(otherUser)) {
                        uniqueEmails.add(otherUser);
                        hasChat = true;

                        const $div = $("<div>")
                            .text(otherUser)
                            .addClass("chat-item")
                            .css("cursor", "pointer")
                            .on("click", () => {
                                activeChatId = generateChatId(currentUserEmail, otherUser);
                                loadChatConversation(otherUser);
                            });

                        $chatList.append($div);
                    }
                }
            });

            if (!hasChat) {
                const $info = $("<div>")
                    .text("Belum ada riwayat chat.")
                    .css({ fontSize: "0.9rem", color: "gray", marginTop: "1rem" });
                $chatList.append($info);
            }
        });
}

// Tampilkan modal untuk mulai chat baru
$("#toggle-recipient").on("click", function () {
    $("#recipient-modal").css("display", "flex");
});

$("#close-recipient-modal").on("click", function () {
    $("#recipient-modal").css("display", "none");
});
$(document).on("keydown", function (e) {
    if (e.key === "Escape") {
        $("#recipient-modal").css("display", "none");
    }
});
$("#recipient-modal").on("click", function (e) {
    // Cek apakah yang diklik adalah latar belakang modal, bukan isi konten
    if (e.target === this) {
        $(this).css("display", "none");
    }
});
