import axios from "axios";

const applink = async (param: any) => {
  const currentOrigin = window.location.origin;
    try {
        const {data} = await axios.post('https://appointment.snabbb.com/api/v1/sso/app_link', {
                    "jsonrpc": "2.0",
                    "method": "call",
                    "params": {
                      "app_code": "appointment",
                      "email": param.username,
                      "name": param.name,
                      "company_id": 2,
                      "portal": true
                    },
                    "id": 1
                  });
      if(data && data.result.url){
        let ssoUrl = data.result.url;

            // Rewrite redirect param to use current origin instead of hardcoded production URL
            ssoUrl = ssoUrl.replace(
                encodeURIComponent('https://appointment.snabbb.com'),
                encodeURIComponent(currentOrigin)
            );

            window.open(ssoUrl, "_self");
    }
    } catch (err: any) {
      console.error("Redirection error:", err);
      throw new Error(err.message || "SSO redirection failed");
    }
}

export default applink;