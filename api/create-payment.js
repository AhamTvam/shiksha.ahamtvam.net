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
            phone
        } = req.body || {};

        // --------------------------------------------------
        // FIXED COURSE PRICES
        // Never trust the amount sent from the frontend.
        // --------------------------------------------------

        const courses = {
            vaali: {
                name: "DaVinci Resolve Vaali (Basic)",
                amount: 999
            },
            sugreeva: {
                name: "DaVinci Resolve Sugreeva (Intermediate)",
                amount: 3499
            },
            garuda: {
                name: "DaVinci Resolve Garuda (Advanced)",
                amount: 9499
            }
        };

        // Validate course
        if (!course || !courses[course]) {
            return res.status(400).json({
                success: false,
                message: "Invalid course selected."
            });
        }

        // Validate customer details
        if (!name || !email || !phone) {
            return res.status(400).json({
                success: false,
                message: "Name, email and phone are required."
            });
        }

        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid email address."
            });
        }

        // Basic Indian phone validation
        const cleanPhone = String(phone).replace(/\D/g, "");

        if (cleanPhone.length !== 10) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid 10-digit phone number."
            });
        }

        const selectedCourse = courses[course];

        // --------------------------------------------------
        // CREATE UNIQUE REGISTRATION REFERENCE
        // --------------------------------------------------

        const registrationId =
            "ATV-" +
            Date.now().toString(36).toUpperCase() +
            "-" +
            Math.random().toString(36).substring(2, 7).toUpperCase();

        // --------------------------------------------------
        // GET ZOHO ACCESS TOKEN USING REFRESH TOKEN
        // --------------------------------------------------

        const tokenParams = new URLSearchParams({
            refresh_token: process.env.ZOHO_REFRESH_TOKEN,
            client_id: process.env.ZOHO_CLIENT_ID,
            client_secret: process.env.ZOHO_CLIENT_SECRET,
            grant_type: "refresh_token"
        });

        const tokenResponse = await fetch(
            "https://accounts.zoho.in/oauth/v2/token",
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/x-www-form-urlencoded"
                },
                body: tokenParams.toString()
            }
        );

        const tokenData = await tokenResponse.json();

        if (!tokenResponse.ok || !tokenData.access_token) {
            console.error("Zoho token error:", tokenData);

            return res.status(500).json({
                success: false,
                message: "Unable to authenticate with payment gateway."
            });
        }

        const accessToken = tokenData.access_token;

        // --------------------------------------------------
        // CREATE ZOHO PAYMENT SESSION
        // --------------------------------------------------

        const paymentData = {
            amount: selectedCourse.amount,
            currency: "INR",

            description:
               `Enrollment for ${selectedCourse.name}`,

            reference_number: registrationId,

            configurations: {
                hosted_checkout_parameters: {
                    phone_country_code: "IN",
                    phone: cleanPhone,
                    name: name.trim(),
                    email: email.trim(),

                    description:
                        `${selectedCourse.name} - Shiksha`,

                    success_url:
                        "https://shiksha.ahamtvam.net/after-enroll.html",

                    failure_url:
                        "https://shiksha.ahamtvam.net/after-enroll.html",

                    udf1: course,
                    udf2: registrationId
                }
            }
        };

        const paymentResponse = await fetch(
            `https://payments.zoho.in/api/v1/paymentsessions?account_id=${process.env.ZOHO_PAYMENTS_ACCOUNT_ID}`,
            {
                method: "POST",

                headers: {
                    "Authorization":
                        `Zoho-oauthtoken ${accessToken}`,

                    "Content-Type": "application/json"
                },

                body: JSON.stringify(paymentData)
            }
        );

        const paymentResult = await paymentResponse.json();

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
        message: "Zoho payment session failed.",
        zoho_error: paymentResult
    });
}

        // --------------------------------------------------
        // CREATE HOSTED CHECKOUT URL
        // --------------------------------------------------

        const accessKey =
            paymentResult.payments_session.access_key;

        const checkoutUrl =
            `https://payments.zoho.in/hostedcheckout/${accessKey}`;

        // --------------------------------------------------
        // SEND RESULT TO FRONTEND
        // --------------------------------------------------

        return res.status(200).json({
            success: true,

            checkout_url: checkoutUrl,

            registration_id: registrationId,

            course: course,

            amount: selectedCourse.amount
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
