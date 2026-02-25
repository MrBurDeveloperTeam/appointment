import {api} from "./api";

export const authOdoo = async ({login, password, fullName, jobPosition, customJobPosition, phone, redirect, name}:any) => {
  const url = "/v1/users";
  const requestData = {
      jsonrpc: "2.0",
      method: "call",
      params: {
        email: login,
        ...(fullName && {name: fullName}),
        ...(password && {password: password}),
        ...(name && {name: name || "login"}),
        ...(fullName && {company_id: 2}),
      },
      id: 1
    };

  try {
    const response = await api.post(
      url,
      requestData
    );

    if (response.data.error) {
      console.log('err res:',response.data.error)
      throw new Error(response.data.error.message);
    }
    return response; 
  } catch (err: any) {
    console.log('err:',err)
    throw new Error(err.message || "Odoo login failed");
  }
};
