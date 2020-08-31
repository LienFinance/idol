# Bond Token/iDOL issuing and auction contracts

## Get Started

```sh
git clone https://github.com/LienFinance/idol.git
cd idol
yarn
```

## What is Bond Token?

-   ETH-backed structured bond, which returns ETH on the pre-specified maturity based on the price from the oracle and the strike price determined in the contract.
-   The cashflow of the structured bond is represented by the piecewise linear function, which is a generalized definition of the strike price.
ex)
<dl>
<dt>SBT, Strike Price: 100USD</dt>
<dd>(x,y)= (0,0) (100,100) (200,100)</dd>
<dt>Normal LBT, Strike price: 100USD</dt>
<dd>(x,y)= (0,0) (100,0) (200,100)</dd>
</dl>

-   For the right outside the definition area, the rightmost line is extended to infinity.
    (To be precise, in order to reduce gas cost, the data is held as the value of slope in each domain on the piecewise linear function.)

-   If the form of the structured bond matches a specific condition, it is called SBT, and it is allowed to be a part of iDOL collateral.
<dl>
<dt>bondID</dt>
<dd>It will be determined by the maturity and the piecewise linear function. If both of them are the same, ID is the same.</dd>
<dt>bondGroup</dt>
<dd>BondGroup is a group of bondIDs that can reproduce original ETH cashflow. Technically, it is verified by checking the sum of y axis values at each x axis point on the piecewise linear function equals to x axis value at each point.</dd>
</dl>

### BondToken implementation

![Explanation_bm_bt](https://user-images.githubusercontent.com/64392013/82320286-fbebac00-9a0d-11ea-8a69-3fc748a319bc.png)
![Explanation_bm_bt (1)](https://user-images.githubusercontent.com/64392013/82320296-fee69c80-9a0d-11ea-817a-a373b723fb8e.png)
![Explanation_bm_bt (2)](https://user-images.githubusercontent.com/64392013/82320302-00b06000-9a0e-11ea-9890-ba73f889bfb6.png)

#### life-cycle of LBT

![lienarch (1)](https://user-images.githubusercontent.com/59379661/86872461-5dc7b880-c117-11ea-857f-cc767533e2d0.png)

## What is iDOL?

-   iDOL is a crypto-derivatives-backed stable coin. The protocol allows _qualified_ SBT to be a part of collateral, and mints iDOL with its face value amount (strike price) in return. The contract verifies qualified SBT by its strike price vs current ETH Price and historical volatility. The threshold condition is derived from black-scholes formula, which is approximated in the smart contract. If historical volatility of ETH is higher than 200%, iDOL mint contract immediately stops accepting deposits.
-   If you deposit SBT with strike price K, you can mint new iDOL tokens with the amount of λK iDOL. (λ: iDOL /USD is the current target exchange rate between iDOL and USD). 10% of the minted iDOL is initially pooled in the contract, and the protocol pays out iDOL partially from the pool to the depositor of the SBT when the auction precisely decides its price.
-   The SBT is converted to ETH when it expires, so the protocol needs to hold an auction slightly before it expires. In addition, once the protocol detects that some SBT behind iDOL is not qualified anymore, the SBT is put up into an emergency auction as well. λK iDOL is minted from the SBT and R iDOL will be burned when the SBT is auctioned off.

        	1. If R > λK → the full amount of reserve λβK iDOL is returned and the remaining R−λK is excessively burned. This will cause the value of iDOL to appreciate. In such a case, the iDOL token will be revalued by decreasing the target exchange rate λ while the gains resulting from the revaluation will be equally shared across all iDOL holders.

        	2. If λK ≥ R ≥ λ(1−β)K → only R−λ(1−β)K is returned and the rest λK−R of the reserve is burned. The value of deposited SBT and minted IDOL tokens does not change in this case.

        	3. If R < λ (1−β)K → you will not get anything returned and all of the reserved λβK iDOL is burned. Also, λ(1−β)K-R are excessively minted but remain unburned, which leads to the dilution of iDOL. In such a case, we devalue the iDOL token by increasing the target rate λ and the losses caused by the devaluation will be equally shared across all iDOL holders.

![lienFlow](https://user-images.githubusercontent.com/64392013/82297514-b8814580-99ed-11ea-9558-1e7b61ba7e16.jpg)
![lienFlow (4)](https://user-images.githubusercontent.com/64392013/82297523-bc14cc80-99ed-11ea-970c-4c81449ed01d.png)

## What is Vickrey Auction?

-   Second price auction for fungible assets.
-   Bids are submitted secretly by hash commit technique. In the auction process, users have to reveal the bid price within the period, there is a penalty if the user reveals the price before the revealing period.

-   The auction is held when the contract fulfills the condition. There are 3 periods in the auction, Bid period, Reveal Period, and Winning Period
<dl>
<dt>Bid Accepting Period</dt>
<dd>The period for bidding, Users send the bid transaction to show their will to participate in the auction. In this period, users deposit iDOL.</dd>

<dt>Reveal Period</dt>
<dd>Users who showed the will for bidding reveal its bid price.</dd>
<dt>Receiving SBT Period</dt>
<dd>The contract evaluates the price for bidding and distributes ETH according to the bid price.</dd>
</dl>

-   For the auction, there are 2 types which are the regular auction and the emergency auction.
<dl>
<dt>Regular Auction</dt>
<dd>Bid Period - 24 hours, Reveal Period - 12 hours, and Winning Period - 24 hours</dd>
<dt>Emergency Auction</dt>
<dd>Bid Period - 1 hour, Reveal Period - 1 hour, and Winning Period - 1 hour</dd>
</dl>

-   Users who send the bid transaction (participating users) during Bid Period have to participate in the auction and take bids to reveal its bid price in the Reveal Period. The penalty that participating users receive is buying SBT at strike price (multiplied by λ). The penalty transactions are processed prior to all other transactions. Participating users receive a penalty in the following cases; 1. If participating users reveal the bid price before the Reveal Period 2. If participating users do not reveal the bid price during the Reveal Period

-   Fractions of the bid price will be rounded off. The fractions are varied according to the price of ETH. The table for this value is indicated in the table below.

| Bid Price     | Nominal Quotation |
| ------------- | ----------------- |
| Less than \$5 | \$0.001           |
| $5-$49.99     | \$0.01            |
| $50-$499.9    | \$0.1             |
| $500-$4999    | \$1               |
| \$5000-       | Follows similarly |

-   In the Winning Period, the bid price which has been revealed in the Reveal Period are sorted. The sorted bid price list is pushed from the outside and the contract validates it. The validation process can be always executed in one transaction because of the nominal quotation. To avoid spams or attacks (e.g. sending many bids with the small amount), we set the lowest bid amount as 100iDOL.
-   To define the contract price, the contract checks the threshold to win a bid by counting the amount of bid from the highest bid price. Details are as follows.

### Example of how SBTs are distributed by the auction

#### Assumption

-   1000SBT are sold at auction.
-   A, B, C, D, E, and F are participants of the auction and they sent bid transactions during the Bid Period.
-   F did not reveal the bid price during the Reveal Period for 100SBT.
-   The bid price of each participant is as follows;

| Price | Bids             | Description                                |
| ----- | ---------------- | ------------------------------------------ |
| \$99  | A:100            |                                            |
| \$98  | B:300            |                                            |
| \$97  | C:400            |                                            |
| \$96  | D:50 E:100 A:150 | D reveals \$96 first, and E&A follow after |
| \$95  | B:200            |                                            |

#### Process of Winning Period

-   F did not reveal the bid price during the Reveal Period while depositing 10000 iDOL. Assuming λ=1 and as his bid price is unknown, the protocol regards the bid at \$100(strike price), so F results in receiving 100SBT (10000/100=100SBT)
    Now, the remaining part is 900SBT.
-   Out of remaining 900SBT, according to the bid price sent by A, B, C, D and E, the contract determines that 96\$ is the threshold.
    1.  The volume from $99 to $97 = $800 < $900
    2.  The volume from $99 to $96 = $1100 > \$900
-   At \$96, since the one who reveals faster wins a bid, D wins for 50SBT and E wins for remaining 50SBT.
-   As the process of deciding the winning amount for each participant may take a lot of gas, the protocol provides the function to find the amount only on their own.
    For other remaining bids are losing bids. Winning bids can buy SBT at the price of losing bids. In conclusion, the result of bids are as follows;

| Price | Winning Bids |
| ----- | ------------ |
| \$99  | A:100        |
| \$98  | B:300        |
| \$97  | C:400        |
| \$96  | D:50         |
| \$96  | E:50         |

| Price | Losing Bids |
| ----- | ----------- |
| \$96  | E:50 A:150  |
| \$95  | B:200       |

-   After defining the winning bids and the losing bids, the contract can earmark the volume of losing bids to winning bids for each participant when they withdraw their own. There can be a case that a huge amount of winning bids for one participant cannot be earmarked as the losing bids are limited to 400SBT. In such a case, the minimum bid price is applied to sell SBT.

The minimum bid price for this case
| Price | Losing Bids |
| ---- | ---- |
| \$90 |∞|

(set at the price λ\*K\*(1-β) for the first time of auction. It will be decreased to λ\*K\*(1-2β) for the second time, etc.)

-   In addition to the process stated above, there is an additional rule. When losing bids are earmarked to winning bids, losing bids of your own are skipped in the calculation. In this case, since A has losing bids (150SBT) at $96, these are skipped for A. Thus, A buys 50SBT at $96 and 50SBT at \$95. As the process of determining each participant settlement price is too costly, the calculation for A is processed when A triggers the withdrawal of SBT. In this case, A deposited (100SBT+150SBT) \* 100 iDOL = 25000iDOL, A also receives refund 25000-(50\*96+50\*95) = 15450 iDOL.

-   The skipped losing bids can be earmarked in other participants' withdrawal process. When the contract earmarks winning bids of B, the losing 150SBT of A is earmarked as well. However, as the losing bid at $95 belongs to B, the remaining 100 SBT is sold at the minimum bid price $90. As a result, B buys 200SBT at $96 and 100SBT at $90. In this case, as B deposited (300SBT+200SBT)\*100 iDOL = 50000iDOL, B is refunded 50000-(200\*96+100\*90) = 21800 iDOL.

-   For C, as C does not have any losing bids, all winning bids(400SBT) are earmarked to all losing bids(400SBT). C deposited 400SBT\*100iDOL = 40000iDOL, C is refunded 40000-(96\*200+95\*200) = 1800iDOL

-   Similarly, D and E can withdraw their own.
    It is possible that not all the SBT are successfully sold. In such a case, the second auction process will start while decreasing the minimum bid price to λ\*K\*(1-2β), and so on.

Summary of the auction result

|     | Paid iDOL Amount             | Description                                                                                       |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------- |
| A   | 96 \* 50 + 95 \* 50          | as need to skip their own losing bits                                                             |
| B   | 96 \* (50 + 150) + 90 \* 100 | as need to skip their own losing bits, and to use the minimum bid price for the remaining         |
| C   | 96 \* (50+150) + 95 \* 200   |                                                                                                   |
| D   | 96 \* 50                     |                                                                                                   |
| E   | 96 \* 50                     | as even skips their own losing bits, there still remains losing bits of other person at the price |

![lienFlow (5)](https://user-images.githubusercontent.com/59379661/86013566-43784580-ba5a-11ea-88e0-93ef63a90546.png)
![lienFlow (1)](https://user-images.githubusercontent.com/59379661/86013574-4410dc00-ba5a-11ea-817f-279cc94e8b4d.jpg)
(special note: If makeAuctionResult() is executed in Receiving Period, the user will receive the amount at the price calculated according to the logic. Otherwise, the user will receive the amount at the highest losing price.)
![lienFlow (6)](https://user-images.githubusercontent.com/59379661/86013578-45420900-ba5a-11ea-8725-180b629e919d.png)

## Contracts

-   contracts/Auction.sol => This contract handles auction process for SBT behind iDOL.
-   contracts/AuctionBoard => This contract handles bid secret/bid board of auctions.
-   contracts/BondMaker.sol => This contract issues bond tokens from deposited ETH.
-   contracts/bondTokenName/BondTokenName.sol => This contract generate a bond token name from the bond properties.
-   contracts/StableCoin.sol => This contract issues iDOL.
-   contracts/DecentralizedOTC/DecentralizedOTC.sol => This contract exchanges LBT to some ERC20 at calculated price.
-   contracts/Wrapper.sol => This contract provides simplified user interfaces of contracts above.

## Basic architecture of iDOL contracts

![lienarch](https://user-images.githubusercontent.com/59379661/86866664-5c44c300-c10c-11ea-9111-a0910a91ac9f.png)

## Test

```sh
yarn
yarn start-ganache
yarn test
```

## Analysis by Mythril

```
myth analyze ./contracts/BondMaker.sol --solv 0.6.6
myth analyze ./contracts/StableCoin.sol --solv 0.6.6
myth analyze ./contracts/Auction.sol --solv 0.6.6
```

The analysis was completed successfully. No issues were detected.
