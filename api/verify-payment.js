
export default async function handler(req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({
            success: false,
            message: "Method not allowed"
        });
    }

    try {
        const { payments_session_id } = req.query;

        if (!payments_session_id) {
            return res.status(400).json({
                success: false,
                message: "Payment session ID is required."
            });
        }

        // --------------------------------------------------
        // GET FRESH ZOHO ACCESS TOKEN
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
                message: "Unable to authenticate with Zoho Payments."
            });
        }

        const accessToken = tokenData.access_token;

        // --------------------------------------------------
        // RETRIEVE PAYMENT SESSION FROM ZOHO
        // --------------------------------------------------

        const zohoResponse = await fetch(
            `https://payments.zoho.in/api/v1/paymentsessions/${encodeURIComponent(
                payments_session_id
            )}?account_id=${process.env.ZOHO_PAYMENTS_ACCOUNT_ID}`,
            {
                method: "GET",
                headers: {
                    "Authorization":
                        `Zoho-oauthtoken ${accessToken}`
                }
            }
        );

        const zohoData = await zohoResponse.json();

        if (!zohoResponse.ok || !zohoData.payments_session) {
            console.error(
                "Zoho verification error:",
                zohoData
            );

            return res.status(500).json({
                success: false,
                message: "Unable to verify payment with Zoho."
            });
        }

        const session = zohoData.payments_session;

        // --------------------------------------------------
        // GET PAYMENT INFORMATION
        // --------------------------------------------------

        const payment =
            Array.isArray(session.payments) &&
            session.payments.length > 0
                ? session.payments[0]
                : null;

        const sessionStatus = session.status;
        const paymentStatus = payment
            ? payment.status
            : null;

        // --------------------------------------------------
        // VERIFY COURSE AND AMOUNT
        // --------------------------------------------------

        const course = session.configurations
            ?.hosted_checkout_parameters
            ?.udf1;

        const registrationId = session.configurations
            ?.hosted_checkout_parameters
            ?.udf2;

        const expectedAmounts = {
            vaali: 999,
            sugreeva: 3499,
            garuda: 9499
        };

        const expectedAmount =
            expectedAmounts[course];

        const actualAmount =
            Number(session.amount);

        const amountMatches =
            expectedAmount !== undefined &&
            actualAmount === expectedAmount;

        // --------------------------------------------------
        // PAYMENT IS VERIFIED ONLY IF BOTH SESSION
        // AND PAYMENT ARE SUCCESSFUL
        // --------------------------------------------------

        const verified =
            sessionStatus === "succeeded" &&
            paymentStatus === "succeeded" &&
            amountMatches;

        // --------------------------------------------------
        // RETURN SAFE RESULT
        // --------------------------------------------------

        return res.status(200).json({
            success: true,
            verified: verified,

            payment_status: paymentStatus,
            session_status: sessionStatus,

            course: course || null,
            amount: actualAmount,

            registration_id:
                registrationId || null,

            payment_id:
                payment?.payment_id || null,

            payments_session_id:
                session.payments_session_id
        });

    } catch (error) {
        console.error(
            "Payment verification error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Something went wrong while verifying the payment."
        });
    }
}
