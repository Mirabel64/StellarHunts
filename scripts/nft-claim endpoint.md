nft-claim endpoint is unauthenticated and accepts an arbitrary userId, allowing mint-for-anyone
Repo Avatar
UnityChainxx/StellarHunts
Labels / Complexity: area:backend, security, priority:critical · High — 5

Problem
backend/src/nft-claim/nft-claim.controller.ts exposes:

@Controller('nft-claim')
export class NFTClaimController {
  @Post('claim')
  async claimNFT(@Body() claimNFTDto: ClaimNFTDto) {
    return this.nftClaimService.claimNFT(claimNFTDto);
  }
}
There is no @UseGuards, and ClaimNFTDto (backend/src/nft-claim/dto/claim-nft.dto.ts) contains userId: string supplied by the client. The service generates operationId from userId:nftId and forwards the DTO to StellarHandlerService.claimNFT, which in mock mode returns a success and in live mode is intended to sign a Soroban mint.

So any anonymous caller can request an NFT claim for any user id and any nft id. The endpoint does not derive identity from a principal, does not check that the requested nft is actually owed, and does not check level completion. Once live mode is wired this becomes an on-chain mint authorization bypass; in mock mode it already returns transactionId: mock_tx_* successes that a client could display as confirmation.

Root cause
Identities are read from the request body and the route has no guard.
