function getTimezoneAbbreviation(timeZone) {
    try {
        const parts = new Intl.DateTimeFormat("en-US", {
            timeZone,
            timeZoneName: "short"
        }).formatToParts(new Date());

        return (
            parts.find(
                part => part.type === "timeZoneName"
            )?.value || timeZone
        );

    } catch {
        return timeZone;
    }
}


export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== "POST") {
        return res.status(405).json({
            success: false,
            message: "Method not allowed"
        });
    }

    try {
        const {
            course,
            name,
            email,
            phone,
            phone_national,
            phone_country_code,
            timezone
        } = req.body || {};

        // --------------------------------------------------
        // GOOGLE SHEETS WEB APP
        // --------------------------------------------------

        const GOOGLE_SHEET_WEBHOOK_URL =
            "https://script.google.com/macros/s/AKfycbxrI0jlMGLfDLu0eL-KuShfwHbZmNhOdW-fzNMAEugq_hauTBVepOAxrOgmhtYWR-vn/exec";

        // --------------------------------------------------
        // FIXED COURSE PRICES
        // Never trust the amount sent from the frontend.
        // --------------------------------------------------

        const courses = {
            vaali: {
                name: "DaVinci Resolve Vaali (Basic)",
                level: "Basic",
                mrp: 1499,
                amount: 999
            },

            sugreeva: {
                name: "DaVinci Resolve Sugreeva (Intermediate)",
                level: "Intermediate",
                mrp: 4499,
                amount: 3499
            },

            garuda: {
                name: "DaVinci Resolve Garuda (Advanced)",
                level: "Advanced",
                mrp: 12999,
                amount: 9499
            }
        };

        // --------------------------------------------------
        // VALIDATE COURSE
        // --------------------------------------------------

        if (!course || !courses[course]) {
            return res.status(400).json({
                success: false,
                message: "Invalid course selected."
            });
        }

        // --------------------------------------------------
        // VALIDATE CUSTOMER DETAILS
        // --------------------------------------------------

        if (!name || !email || !phone) {
            return res.status(400).json({
                success: false,
                message: "Name, email and phone are required."
            });
        }

        // --------------------------------------------------
        // BASIC EMAIL VALIDATION
        // --------------------------------------------------

        const emailRegex =
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid email address."
            });
        }

        // --------------------------------------------------
        // BASIC INDIAN PHONE VALIDATION
        // --------------------------------------------------

        const cleanPhone = String(phone).trim();

        const cleanPhone =
    String(phone_national || "")
        .replace(/\D/g, "");

const studentPhone =
    String(phone || "").trim();

const phoneCountryCode =
    String(phone_country_code || "")
        .trim()
        .toUpperCase();


if (!studentPhone) {

    return res.status(400).json({
        success: false,
        message:
            "Please enter a valid mobile number."
    });

}


if (!/^\+[1-9]\d{6,14}$/.test(studentPhone)) {

    return res.status(400).json({
        success: false,
        message:
            "Please enter a valid international mobile number."
    });

}


if (!/^[A-Z]{2}$/.test(phoneCountryCode)) {

    return res.status(400).json({
        success: false,
        message:
            "Invalid phone country."
    });

}


if (!/^\d{4,15}$/.test(cleanPhone)) {

    return res.status(400).json({
        success: false,
        message:
            "Invalid phone number."
    });

}

        const selectedCourse = courses[course];
        
        const studentTimezone =
    timezone || "Asia/Kolkata";

const registrationDate =
    new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
        timeZone: studentTimezone
    }).format(new Date());

const timezoneAbbreviation =
    getTimezoneAbbreviation(studentTimezone);

const registrationDateWithTimezone =
    `${registrationDate} ${timezoneAbbreviation} (${studentTimezone})`;

        

        const studentName = name.trim();
        const studentEmail = email.trim();

        // --------------------------------------------------
        // CREATE UNIQUE REGISTRATION REFERENCE
        // --------------------------------------------------

        const registrationId =
            "ATV-" +
            Date.now().toString(36).toUpperCase() +
            "-" +
            Math.random()
                .toString(36)
                .substring(2, 7)
                .toUpperCase();

        // --------------------------------------------------
        // GET ZOHO ACCESS TOKEN
        // --------------------------------------------------

        const tokenParams = new URLSearchParams({
            refresh_token:
                process.env.ZOHO_REFRESH_TOKEN,

            client_id:
                process.env.ZOHO_CLIENT_ID,

            client_secret:
                process.env.ZOHO_CLIENT_SECRET,

            grant_type:
                "refresh_token"
        });

        const tokenResponse = await fetch(
            "https://accounts.zoho.in/oauth/v2/token",
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/x-www-form-urlencoded"
                },

                body:
                    tokenParams.toString()
            }
        );

        const tokenData =
            await tokenResponse.json();

        if (
            !tokenResponse.ok ||
            !tokenData.access_token
        ) {
            console.error(
                "Zoho token error:",
                tokenData
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to authenticate with payment gateway."
            });
        }

        const accessToken =
            tokenData.access_token;

        // --------------------------------------------------
        // CREATE ZOHO PAYMENT SESSION
        // --------------------------------------------------

        const paymentData = {
            amount:
                selectedCourse.amount,

            currency:
                "INR",

            description:
                `Enrollment for ${selectedCourse.name}`,

            reference_number:
                registrationId,

            configurations: {

                hosted_checkout_parameters: {

                    phone_country_code:
                        phoneCountryCode,

                    phone:
                        cleanPhone,

                    name:
                        studentName,

                    email:
                        studentEmail,

                    description:
                        `${selectedCourse.name} - Shiksha`,

                    success_url:
                        "https://shiksha.ahamtvam.net/after-enroll.html",

                    failure_url:
                        "https://shiksha.ahamtvam.net/after-enroll.html",

                    // UDF1 = Course
                    udf1:
                        course,

                    // UDF2 = Registration ID
                    udf2:
                        registrationId,

                    // UDF3 = Student Name
                    udf3:
                        studentName
                }
            }
        };

        const paymentResponse =
            await fetch(
                `https://payments.zoho.in/api/v1/paymentsessions?account_id=${process.env.ZOHO_PAYMENTS_ACCOUNT_ID}`,
                {
                    method: "POST",

                    headers: {
                        "Authorization":
                            `Zoho-oauthtoken ${accessToken}`,

                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify(paymentData)
                }
            );

        const paymentResult =
            await paymentResponse.json();

        // --------------------------------------------------
        // HANDLE ZOHO ERROR
        // --------------------------------------------------

        if (
            !paymentResponse.ok ||
            !paymentResult.payments_session ||
            !paymentResult.payments_session.access_key
        ) {
            console.error(
                "Zoho payment session error:",
                paymentResult
            );

            return res.status(500).json({
                success: false,
                message:
                    "Zoho payment session failed.",
                zoho_error:
                    paymentResult
            });
        }

        // --------------------------------------------------
        // EXTRACT PAYMENT SESSION
        // --------------------------------------------------

        const paymentSession =
            paymentResult.payments_session;

        const paymentSessionId =
            paymentSession.payments_session_id;

        // --------------------------------------------------
        // SAVE INITIAL REGISTRATION TO GOOGLE SHEET
        // --------------------------------------------------

        try {

            const sheetResponse =
                await fetch(
                    GOOGLE_SHEET_WEBHOOK_URL,
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify({

                                registration_id:
                                    registrationId,

                                student_name:
                                    studentName,

                                email:
                                    studentEmail,

                                phone:
                                    studentPhone,

                                course:
                                    course,

                                course_level:
                                    selectedCourse.level,

                                mrp:
                                    selectedCourse.mrp,

                                offer_price:
                                    selectedCourse.amount,

                                payment_id:
                                    "",

                                payment_session_id:
                                    paymentSessionId,

                                payment_status:
                                    "Payment Pending",

                                payment_failed_count:
                                    0,

                                payment_attempt_count:
                                    1,

                                payment_method:
                                    "",

                                payment_amount:
                                    selectedCourse.amount,

                                registration_date:
                                    new Intl.DateTimeFormat("en-IN", {
                                             day: "2-digit",
                                             month: "2-digit",
                                             year: "numeric",
                                             hour: "2-digit",
                                             minute: "2-digit",
                                             second: "2-digit",
                                             hour12: true,
                                             timeZone: timezone || "Asia/Kolkata",
                                             timeZoneName: "short"
                                        }).format(new Date())
                            })
                    }
                );

            if (!sheetResponse.ok) {

                console.error(
                    "Google Sheet error:",
                    await sheetResponse.text()
                );

            } else {

                const sheetResult =
                    await sheetResponse.json();

                console.log(
                    "Google Sheet registration:",
                    sheetResult
                );
            }

        } catch (sheetError) {

            // Do NOT stop the student's payment flow
            // if Google Sheets has a temporary problem.

            console.error(
                "Google Sheet connection error:",
                sheetError
            );
        }

        // --------------------------------------------------
        // CREATE HOSTED CHECKOUT URL
        // --------------------------------------------------

        const accessKey =
            paymentSession.access_key;

        const checkoutUrl =
            `https://payments.zoho.in/hostedcheckout/${accessKey}`;

        // --------------------------------------------------
        // SEND RESULT TO FRONTEND
        // --------------------------------------------------

        return res.status(200).json({

            success:
                true,

            checkout_url:
                checkoutUrl,

            registration_id:
                registrationId,

            course:
                course,

            amount:
                selectedCourse.amount,

            payments_session_id:
                paymentSessionId
        });

    } catch (error) {

        console.error(
            "Create payment error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Something went wrong while creating the payment."
        });
    }
}
